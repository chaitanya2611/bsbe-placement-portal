import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type { ApiEnvironment } from '@bsbe/config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

@Injectable()
export class MediaStorageService {
  private readonly s3Client: S3Client | undefined;
  private readonly localRoot: string;

  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {
    this.localRoot = resolve(process.cwd(), config.get('MEDIA_LOCAL_ROOT', { infer: true }));
    if (config.get('MEDIA_STORAGE_DRIVER', { infer: true }) === 's3') {
      const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
      const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });
      const s3Configuration: S3ClientConfig = {
        region: config.get('S3_REGION', { infer: true }),
        forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      };
      const endpoint = config.get('S3_ENDPOINT', { infer: true });
      if (endpoint) s3Configuration.endpoint = endpoint;
      if (accessKeyId && secretAccessKey) {
        s3Configuration.credentials = { accessKeyId, secretAccessKey };
      }
      this.s3Client = new S3Client(s3Configuration);
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.s3Client) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket(),
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'private, no-store',
          ServerSideEncryption: 'AES256',
        }),
      );
      return;
    }
    const target = this.localPath(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, { flag: 'wx' });
  }

  async get(key: string): Promise<Buffer> {
    if (this.s3Client) {
      const result = await this.s3Client.send(
        new GetObjectCommand({ Bucket: this.bucket(), Key: key }),
      );
      if (!result.Body) throw new Error('Stored media body is missing');
      return Buffer.from(await result.Body.transformToByteArray());
    }
    return readFile(this.localPath(key));
  }

  async delete(key: string): Promise<void> {
    if (this.s3Client) {
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }));
      return;
    }
    try {
      await unlink(this.localPath(key));
    } catch (error) {
      if (!this.isMissingFile(error)) throw error;
    }
  }

  private bucket(): string {
    const bucket = this.config.get('S3_BUCKET', { infer: true });
    if (!bucket) throw new Error('S3 bucket is not configured');
    return bucket;
  }

  private localPath(key: string): string {
    if (!/^[a-f0-9/-]+\.webp$/.test(key)) throw new Error('Invalid media storage key');
    const target = resolve(this.localRoot, key);
    if (!target.startsWith(`${this.localRoot}${sep}`))
      throw new Error('Media path escaped storage root');
    return target;
  }

  private isMissingFile(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
    );
  }
}
