import type { MediaAsset } from '@bsbe/contracts';
import type { ApiEnvironment } from '@bsbe/config';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import type { Model } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import sharp from 'sharp';
import { AuditService } from '../identity/audit.service';
import type { UserDocument } from '../identity/identity.models';
import {
  QUESTION_MODELS,
  type MediaAssetDocument,
  type MediaAssetRecord,
  type QuestionVersionRecord,
} from './question.models';
import { MediaStorageService } from './media-storage.service';

interface StoredMediaContent {
  asset: MediaAssetDocument;
  body: Buffer;
}

@Injectable()
export class MediaService {
  constructor(
    @InjectModel(QUESTION_MODELS.mediaAsset)
    private readonly mediaModel: Model<MediaAssetRecord>,
    @InjectModel(QUESTION_MODELS.questionVersion)
    private readonly versionModel: Model<QuestionVersionRecord>,
    private readonly storage: MediaStorageService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly audit: AuditService,
  ) {}

  async upload(
    file: Express.Multer.File | undefined,
    actor: UserDocument,
    request: Request,
  ): Promise<MediaAsset> {
    if (!file) {
      throw new BadRequestException({
        code: 'MEDIA_FILE_REQUIRED',
        message: 'Image file is required',
      });
    }
    if (file.size > this.config.get('MEDIA_MAX_BYTES', { infer: true })) {
      throw new BadRequestException({
        code: 'MEDIA_TOO_LARGE',
        message: 'Image exceeds upload limit',
      });
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'MEDIA_TYPE_FORBIDDEN',
        message: 'Only JPEG, PNG, and WebP images are accepted',
      });
    }

    const image = sharp(file.buffer, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: this.config.get('MEDIA_MAX_PIXELS', { infer: true }),
    });
    let metadata: sharp.Metadata;
    try {
      metadata = await image.metadata();
    } catch {
      throw new BadRequestException({
        code: 'MEDIA_DECODE_FAILED',
        message: 'Image could not be safely decoded',
      });
    }
    if (
      !metadata.width ||
      !metadata.height ||
      !metadata.format ||
      !['jpeg', 'png', 'webp'].includes(metadata.format) ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new BadRequestException({
        code: 'MEDIA_CONTENT_INVALID',
        message: 'Image content or dimensions are unsupported',
      });
    }

    const output = await image
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    const sha256 = createHash('sha256').update(output.data).digest('hex');
    const existing = await this.mediaModel
      .findOne({ sha256, status: 'ready' })
      .select('+sha256')
      .exec();
    if (existing) {
      await this.audit.record({
        eventType: 'media.deduplicated',
        actorUserId: actor._id,
        actorRole: actor.role,
        targetType: 'media',
        targetPublicId: existing.publicId,
        outcome: 'success',
        request,
      });
      return this.response(existing);
    }

    const publicId = randomUUID();
    const storageKey = `${new Date().toISOString().slice(0, 7).replace('-', '/')}/${publicId}.webp`;
    await this.storage.put(storageKey, output.data, 'image/webp');
    try {
      const asset = await this.mediaModel.create({
        publicId,
        storageKey,
        originalFileName: this.safeFileName(file.originalname),
        contentType: 'image/webp',
        sizeBytes: output.data.length,
        width: output.info.width,
        height: output.info.height,
        sha256,
        status: 'ready',
        createdBy: actor._id,
      });
      await this.audit.record({
        eventType: 'media.created',
        actorUserId: actor._id,
        actorRole: actor.role,
        targetType: 'media',
        targetPublicId: publicId,
        outcome: 'success',
        metadata: {
          contentType: 'image/webp',
          sizeBytes: output.data.length,
          width: output.info.width,
          height: output.info.height,
        },
        request,
      });
      return this.response(asset);
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
  }

  async list(limit: number): Promise<MediaAsset[]> {
    const assets = await this.mediaModel
      .find({ status: 'ready' })
      .select('+sha256')
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return assets.map((asset) => this.response(asset));
  }

  async content(publicId: string): Promise<StoredMediaContent> {
    const asset = await this.mediaModel
      .findOne({ publicId, status: 'ready' })
      .select('+storageKey')
      .exec();
    if (!asset)
      throw new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Media not found' });
    return { asset, body: await this.storage.get(asset.storageKey) };
  }

  async remove(publicId: string, actor: UserDocument, request: Request): Promise<void> {
    const asset = await this.mediaModel
      .findOne({ publicId, status: 'ready' })
      .select('+storageKey')
      .exec();
    if (!asset)
      throw new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Media not found' });
    const referenced = await this.versionModel.exists({
      $or: [{ mediaIds: asset._id }, { 'options.mediaId': asset._id }],
    });
    if (referenced) {
      throw new ConflictException({
        code: 'MEDIA_IN_USE',
        message: 'Media referenced by a question version cannot be deleted',
      });
    }
    await this.storage.delete(asset.storageKey);
    asset.status = 'deleted';
    asset.deletedAt = new Date();
    await asset.save();
    await this.audit.record({
      eventType: 'media.deleted',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'media',
      targetPublicId: publicId,
      outcome: 'success',
      request,
    });
  }

  private response(asset: MediaAssetDocument): MediaAsset {
    return {
      id: asset.publicId,
      fileName: asset.originalFileName,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      width: asset.width,
      height: asset.height,
      sha256: asset.sha256,
      status: asset.status,
      createdAt: asset.createdAt.toISOString(),
    };
  }

  private safeFileName(input: string): string {
    const name = basename(input)
      .split('')
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code > 31 && code !== 127 && !['"', "'", '<', '>'].includes(character);
      })
      .join('')
      .trim();
    return (name || 'uploaded-image').slice(0, 240);
  }
}
