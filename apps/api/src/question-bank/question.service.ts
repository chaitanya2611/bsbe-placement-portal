import type {
  QuestionDefinition,
  QuestionStatus,
  QuestionSummary,
  SafeQuestionVersion,
  UpdateQuestionInput,
} from '@bsbe/contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import { type Connection, type Model, RootFilterQuery, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../identity/audit.service';
import type { UserDocument } from '../identity/identity.models';
import { ChemicalValidationService } from './chemical-validation.service';
import type { ListQuestionsDto } from './question.dto';
import {
  QUESTION_MODELS,
  type MediaAssetRecord,
  type QuestionDocument,
  type QuestionRecord,
  type QuestionRubricRecord,
  type QuestionUsageRecord,
  type QuestionVersionDocument,
  type QuestionVersionRecord,
} from './question.models';
import { RubricCryptoService } from './rubric-crypto.service';

export interface QuestionHistory {
  versions: Array<{ id: string; version: number; createdAt: string }>;
  usage: Array<{
    examId: string;
    examVersionId: string;
    questionVersion: number;
    recordedAt: string;
  }>;
}

export interface RevealedRubric {
  questionId: string;
  questionVersionId: string;
  version: number;
  answer: unknown;
}

@Injectable()
export class QuestionService {
  constructor(
    @InjectModel(QUESTION_MODELS.question) private readonly questionModel: Model<QuestionRecord>,
    @InjectModel(QUESTION_MODELS.questionVersion)
    private readonly versionModel: Model<QuestionVersionRecord>,
    @InjectModel(QUESTION_MODELS.questionRubric)
    private readonly rubricModel: Model<QuestionRubricRecord>,
    @InjectModel(QUESTION_MODELS.questionUsage)
    private readonly usageModel: Model<QuestionUsageRecord>,
    @InjectModel(QUESTION_MODELS.mediaAsset)
    private readonly mediaModel: Model<MediaAssetRecord>,
    @InjectConnection() private readonly connection: Connection,
    private readonly chemistry: ChemicalValidationService,
    private readonly crypto: RubricCryptoService,
    private readonly audit: AuditService,
  ) {}

  async create(
    definition: QuestionDefinition,
    actor: UserDocument,
    request: Request,
  ): Promise<SafeQuestionVersion> {
    await this.chemistry.validate(definition.chemicalStructure);
    const media = await this.resolveMedia(definition);
    const questionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const questionPublicId = randomUUID();
    const versionPublicId = randomUUID();
    let createdVersion: QuestionVersionDocument | undefined;

    await this.connection.transaction(async (databaseSession) => {
      const versions = await this.versionModel.create(
        [this.versionRecord(questionId, versionId, versionPublicId, 1, definition, media, actor)],
        { session: databaseSession },
      );
      createdVersion = versions[0];
      await this.rubricModel.create(
        [
          {
            questionVersionId: versionId,
            ...this.crypto.encrypt(versionId, definition.answer),
          },
        ],
        { session: databaseSession },
      );
      await this.questionModel.create(
        [
          {
            _id: questionId,
            publicId: questionPublicId,
            currentVersionId: versionId,
            currentVersionNumber: 1,
            type: definition.type,
            status: 'draft',
            promptSummary: this.promptSummary(definition.prompt),
            searchText: this.searchText(definition),
            difficulty: definition.difficulty,
            tags: this.tags(definition.tags),
            marks: definition.marks,
            negativeMarks: definition.negativeMarks,
            createdBy: actor._id,
            updatedBy: actor._id,
          },
        ],
        { session: databaseSession },
      );
      await this.audit.record({
        eventType: 'question.created',
        actorUserId: actor._id,
        actorRole: actor.role,
        targetType: 'question',
        targetPublicId: questionPublicId,
        outcome: 'success',
        metadata: { questionType: definition.type, version: 1 },
        request,
        databaseSession,
      });
    });
    if (!createdVersion) throw new Error('Question transaction did not create a version');
    return this.safeVersion(questionPublicId, createdVersion);
  }

  async update(
    publicId: string,
    input: UpdateQuestionInput,
    actor: UserDocument,
    request: Request,
  ): Promise<SafeQuestionVersion> {
    const question = await this.questionModel.findOne({ publicId }).exec();
    if (!question) throw this.notFound();
    if (question.status === 'archived') {
      throw new ConflictException({
        code: 'QUESTION_ARCHIVED',
        message: 'Archived questions cannot be edited; clone the question instead',
      });
    }
    if (question.currentVersionNumber !== input.expectedVersion) {
      throw new ConflictException({
        code: 'QUESTION_VERSION_CONFLICT',
        message: 'Question changed since it was loaded',
      });
    }
    await this.chemistry.validate(input.definition.chemicalStructure);
    const media = await this.resolveMedia(input.definition);
    const oldAnswer = await this.answerForVersion(question.currentVersionId);
    const versionId = new Types.ObjectId();
    const versionPublicId = randomUUID();
    const nextVersion = input.expectedVersion + 1;
    let createdVersion: QuestionVersionDocument | undefined;

    await this.connection.transaction(async (databaseSession) => {
      const versions = await this.versionModel.create(
        [
          this.versionRecord(
            question._id,
            versionId,
            versionPublicId,
            nextVersion,
            input.definition,
            media,
            actor,
          ),
        ],
        { session: databaseSession },
      );
      createdVersion = versions[0];
      await this.rubricModel.create(
        [
          {
            questionVersionId: versionId,
            ...this.crypto.encrypt(versionId, input.definition.answer),
          },
        ],
        { session: databaseSession },
      );
      const updated = await this.questionModel.updateOne(
        { _id: question._id, currentVersionNumber: input.expectedVersion },
        {
          $set: {
            currentVersionId: versionId,
            currentVersionNumber: nextVersion,
            type: input.definition.type,
            promptSummary: this.promptSummary(input.definition.prompt),
            searchText: this.searchText(input.definition),
            difficulty: input.definition.difficulty,
            tags: this.tags(input.definition.tags),
            marks: input.definition.marks,
            negativeMarks: input.definition.negativeMarks,
            updatedBy: actor._id,
          },
        },
        { session: databaseSession },
      );
      if (updated.modifiedCount !== 1) {
        throw new ConflictException({
          code: 'QUESTION_VERSION_CONFLICT',
          message: 'Question changed while the new version was being saved',
        });
      }
      await this.audit.record({
        eventType: 'question.version-created',
        actorUserId: actor._id,
        actorRole: actor.role,
        targetType: 'question',
        targetPublicId: publicId,
        outcome: 'success',
        metadata: { version: nextVersion, questionType: input.definition.type },
        request,
        databaseSession,
      });
      if (JSON.stringify(oldAnswer) !== JSON.stringify(input.definition.answer)) {
        await this.audit.record({
          eventType: 'question.correct-answer-changed',
          actorUserId: actor._id,
          actorRole: actor.role,
          targetType: 'question',
          targetPublicId: publicId,
          outcome: 'success',
          metadata: { fromVersion: input.expectedVersion, toVersion: nextVersion },
          request,
          databaseSession,
        });
      }
    });
    if (!createdVersion) throw new Error('Question transaction did not create a version');
    return this.safeVersion(publicId, createdVersion);
  }

  async clone(
    publicId: string,
    actor: UserDocument,
    request: Request,
  ): Promise<SafeQuestionVersion> {
    const source = await this.questionModel.findOne({ publicId }).select('+searchText').exec();
    if (!source) throw this.notFound();
    const sourceVersion = await this.versionModel.findById(source.currentVersionId).exec();
    if (!sourceVersion) throw new Error('Current question version is unavailable');
    const answer = await this.answerForVersion(sourceVersion._id);
    const newQuestionId = new Types.ObjectId();
    const newVersionId = new Types.ObjectId();
    const newQuestionPublicId = randomUUID();
    const newVersionPublicId = randomUUID();
    let cloneVersion: QuestionVersionDocument | undefined;

    await this.connection.transaction(async (databaseSession) => {
      const versions = await this.versionModel.create(
        [
          {
            _id: newVersionId,
            publicId: newVersionPublicId,
            questionId: newQuestionId,
            versionNumber: 1,
            type: sourceVersion.type,
            prompt: sourceVersion.prompt,
            options: sourceVersion.options.map((option) => ({
              id: option.id,
              text: option.text,
              ...(option.mediaId ? { mediaId: option.mediaId } : {}),
            })),
            marks: sourceVersion.marks,
            negativeMarks: sourceVersion.negativeMarks,
            difficulty: sourceVersion.difficulty,
            tags: [...sourceVersion.tags],
            explanation: sourceVersion.explanation,
            mediaIds: [...sourceVersion.mediaIds],
            ...(sourceVersion.chemicalStructure
              ? {
                  chemicalStructure: {
                    format: sourceVersion.chemicalStructure.format,
                    source: sourceVersion.chemicalStructure.source,
                  },
                }
              : {}),
            ...(sourceVersion.numerical
              ? {
                  numerical: {
                    unit: sourceVersion.numerical.unit,
                    ...(sourceVersion.numerical.decimalPlaces === undefined
                      ? {}
                      : { decimalPlaces: sourceVersion.numerical.decimalPlaces }),
                  },
                }
              : {}),
            createdBy: actor._id,
          },
        ],
        { session: databaseSession },
      );
      cloneVersion = versions[0];
      await this.rubricModel.create(
        [
          {
            questionVersionId: newVersionId,
            ...this.crypto.encrypt(newVersionId, answer),
          },
        ],
        { session: databaseSession },
      );
      await this.questionModel.create(
        [
          {
            _id: newQuestionId,
            publicId: newQuestionPublicId,
            currentVersionId: newVersionId,
            currentVersionNumber: 1,
            type: source.type,
            status: 'draft',
            promptSummary: source.promptSummary,
            searchText: source.searchText,
            difficulty: source.difficulty,
            tags: [...source.tags],
            marks: source.marks,
            negativeMarks: source.negativeMarks,
            createdBy: actor._id,
            updatedBy: actor._id,
          },
        ],
        { session: databaseSession },
      );
      await this.audit.record({
        eventType: 'question.cloned',
        actorUserId: actor._id,
        actorRole: actor.role,
        targetType: 'question',
        targetPublicId: newQuestionPublicId,
        outcome: 'success',
        metadata: { sourceQuestionId: publicId },
        request,
        databaseSession,
      });
    });
    if (!cloneVersion) throw new Error('Clone transaction did not create a version');
    return this.safeVersion(newQuestionPublicId, cloneVersion);
  }

  async list(query: ListQuestionsDto): Promise<QuestionSummary[]> {
    const filter: RootFilterQuery<QuestionRecord> = {};
    if (query.type) filter.type = query.type;
    if (query.difficulty) filter.difficulty = query.difficulty;
    if (query.status) filter.status = query.status;
    if (query.tag) filter.tags = query.tag;
    if (query.search) filter.$text = { $search: query.search };
    const questions = await this.questionModel
      .find(filter)
      .sort(query.search ? { score: { $meta: 'textScore' } } : { updatedAt: -1 })
      .limit(query.limit)
      .exec();
    return questions.map((question) => this.summary(question));
  }

  async current(publicId: string): Promise<SafeQuestionVersion> {
    const question = await this.questionModel.findOne({ publicId }).exec();
    if (!question) throw this.notFound();
    const version = await this.versionModel.findById(question.currentVersionId).exec();
    if (!version) throw new Error('Current question version is unavailable');
    return this.safeVersion(publicId, version);
  }

  async setStatus(
    publicId: string,
    status: QuestionStatus,
    reason: string,
    actor: UserDocument,
    request: Request,
  ): Promise<QuestionSummary> {
    const question = await this.questionModel.findOne({ publicId }).exec();
    if (!question) throw this.notFound();
    if (question.status === status) return this.summary(question);
    if (question.status === 'archived' && status === 'active') {
      throw new BadRequestException({
        code: 'QUESTION_STATUS_INVALID',
        message: 'Restore an archived question to draft before activation',
      });
    }
    question.status = status;
    question.updatedBy = actor._id;
    await question.save();
    await this.audit.record({
      eventType: status === 'archived' ? 'question.archived' : 'question.status-changed',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'question',
      targetPublicId: publicId,
      outcome: 'success',
      reason,
      metadata: { status },
      request,
    });
    return this.summary(question);
  }

  async revealRubric(
    publicId: string,
    actor: UserDocument,
    request: Request,
  ): Promise<RevealedRubric> {
    const question = await this.questionModel.findOne({ publicId }).exec();
    if (!question) throw this.notFound();
    const version = await this.versionModel.findById(question.currentVersionId).exec();
    if (!version) throw new Error('Current question version is unavailable');
    const answer = await this.answerForVersion(version._id);
    await this.audit.record({
      eventType: 'question.rubric-revealed',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'question',
      targetPublicId: publicId,
      outcome: 'success',
      metadata: { version: version.versionNumber },
      request,
    });
    return {
      questionId: publicId,
      questionVersionId: version.publicId,
      version: version.versionNumber,
      answer,
    };
  }

  async history(publicId: string): Promise<QuestionHistory> {
    const question = await this.questionModel.findOne({ publicId }).exec();
    if (!question) throw this.notFound();
    const [versions, usage] = await Promise.all([
      this.versionModel.find({ questionId: question._id }).sort({ versionNumber: -1 }).exec(),
      this.usageModel.find({ questionId: question._id }).sort({ recordedAt: -1 }).exec(),
    ]);
    const versionNumbers = new Map(
      versions.map((version) => [version._id.toHexString(), version.versionNumber]),
    );
    return {
      versions: versions.map((version) => ({
        id: version.publicId,
        version: version.versionNumber,
        createdAt: version.createdAt.toISOString(),
      })),
      usage: usage.map((record) => ({
        examId: record.examPublicId,
        examVersionId: record.examVersionPublicId,
        questionVersion: versionNumbers.get(record.questionVersionId.toHexString()) ?? 0,
        recordedAt: record.recordedAt.toISOString(),
      })),
    };
  }

  private async resolveMedia(
    definition: QuestionDefinition,
  ): Promise<Map<string, MediaAssetRecord & { _id: Types.ObjectId }>> {
    const publicIds = new Set(definition.mediaIds);
    if ('options' in definition) {
      for (const option of definition.options) if (option.mediaId) publicIds.add(option.mediaId);
    }
    if (publicIds.size === 0) return new Map();
    const assets = await this.mediaModel
      .find({ publicId: { $in: [...publicIds] }, status: 'ready' })
      .exec();
    if (assets.length !== publicIds.size) {
      throw new BadRequestException({
        code: 'QUESTION_MEDIA_INVALID',
        message: 'One or more media references are unavailable',
      });
    }
    return new Map(assets.map((asset) => [asset.publicId, asset]));
  }

  private versionRecord(
    questionId: Types.ObjectId,
    versionId: Types.ObjectId,
    publicId: string,
    versionNumber: number,
    definition: QuestionDefinition,
    media: Map<string, MediaAssetRecord & { _id: Types.ObjectId }>,
    actor: UserDocument,
  ): QuestionVersionRecord & { _id: Types.ObjectId } {
    return {
      _id: versionId,
      publicId,
      questionId,
      versionNumber,
      type: definition.type,
      prompt: definition.prompt,
      options:
        'options' in definition
          ? definition.options.map((option) => ({
              id: option.id,
              text: option.text,
              ...(option.mediaId ? { mediaId: media.get(option.mediaId)!._id } : {}),
            }))
          : [],
      marks: definition.marks,
      negativeMarks: definition.negativeMarks,
      difficulty: definition.difficulty,
      tags: this.tags(definition.tags),
      explanation: definition.explanation,
      mediaIds: definition.mediaIds.map((id) => media.get(id)!._id),
      ...(definition.chemicalStructure ? { chemicalStructure: definition.chemicalStructure } : {}),
      ...(definition.type === 'numerical'
        ? {
            numerical: {
              unit: definition.numerical.unit,
              ...(definition.numerical.decimalPlaces === undefined
                ? {}
                : { decimalPlaces: definition.numerical.decimalPlaces }),
            },
          }
        : {}),
      createdBy: actor._id,
      createdAt: new Date(),
    };
  }

  private async safeVersion(
    questionPublicId: string,
    version: QuestionVersionDocument,
  ): Promise<SafeQuestionVersion> {
    const objectIds = new Set(version.mediaIds.map((id) => id.toHexString()));
    for (const option of version.options)
      if (option.mediaId) objectIds.add(option.mediaId.toHexString());
    const assets = objectIds.size
      ? await this.mediaModel.find({ _id: { $in: [...objectIds] } }).exec()
      : [];
    const publicIds = new Map(assets.map((asset) => [asset._id.toHexString(), asset.publicId]));
    return {
      id: version.publicId,
      questionId: questionPublicId,
      version: version.versionNumber,
      type: version.type,
      prompt: version.prompt,
      options: version.options.map((option) => ({
        id: option.id,
        text: option.text,
        ...(option.mediaId ? { mediaId: publicIds.get(option.mediaId.toHexString())! } : {}),
      })),
      marks: version.marks,
      negativeMarks: version.negativeMarks,
      difficulty: version.difficulty,
      tags: [...version.tags],
      explanation: version.explanation,
      mediaIds: version.mediaIds.map((id) => publicIds.get(id.toHexString())!),
      chemicalStructure: version.chemicalStructure ?? null,
      numerical: version.numerical
        ? {
            unit: version.numerical.unit,
            decimalPlaces: version.numerical.decimalPlaces ?? null,
          }
        : null,
      createdAt: version.createdAt.toISOString(),
    };
  }

  private async answerForVersion(questionVersionId: Types.ObjectId): Promise<unknown> {
    const rubric = await this.rubricModel
      .findOne({ questionVersionId })
      .select('+iv +ciphertext +authTag')
      .exec();
    if (!rubric) throw new Error('Question rubric is unavailable');
    return this.crypto.decrypt(questionVersionId, {
      keyVersion: rubric.keyVersion,
      algorithm: rubric.algorithm,
      iv: rubric.iv,
      ciphertext: rubric.ciphertext,
      authTag: rubric.authTag,
    });
  }

  private summary(question: QuestionDocument): QuestionSummary {
    return {
      id: question.publicId,
      version: question.currentVersionNumber,
      type: question.type,
      status: question.status,
      promptSummary: question.promptSummary,
      difficulty: question.difficulty,
      tags: [...question.tags],
      marks: question.marks,
      negativeMarks: question.negativeMarks,
      updatedAt: question.updatedAt.toISOString(),
    };
  }

  private promptSummary(prompt: string): string {
    return prompt.replace(/\s+/g, ' ').trim().slice(0, 240);
  }

  private searchText(definition: QuestionDefinition): string {
    return [
      definition.prompt,
      definition.explanation,
      ...definition.tags,
      ...('options' in definition ? definition.options.map((option) => option.text) : []),
    ]
      .join(' ')
      .slice(0, 25_000);
  }

  private tags(tags: string[]): string[] {
    return tags.map((tag) => tag.trim().toLowerCase());
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'QUESTION_NOT_FOUND', message: 'Question not found' });
  }
}
