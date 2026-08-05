import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { IDENTITY_MODELS, type MigrationRecord } from '../identity/identity.models';
import {
  QUESTION_MODELS,
  type MediaAssetRecord,
  type QuestionRecord,
  type QuestionRubricRecord,
  type QuestionUsageRecord,
  type QuestionVersionRecord,
} from './question.models';

@Injectable()
export class QuestionMigrationService {
  constructor(
    @InjectModel(IDENTITY_MODELS.migration) private readonly migrationModel: Model<MigrationRecord>,
    @InjectModel(QUESTION_MODELS.mediaAsset) private readonly mediaModel: Model<MediaAssetRecord>,
    @InjectModel(QUESTION_MODELS.question) private readonly questionModel: Model<QuestionRecord>,
    @InjectModel(QUESTION_MODELS.questionVersion)
    private readonly versionModel: Model<QuestionVersionRecord>,
    @InjectModel(QUESTION_MODELS.questionRubric)
    private readonly rubricModel: Model<QuestionRubricRecord>,
    @InjectModel(QUESTION_MODELS.questionUsage)
    private readonly usageModel: Model<QuestionUsageRecord>,
  ) {}

  async run(): Promise<string[]> {
    const migrationId = '003-question-bank-media-indexes';
    if (await this.migrationModel.exists({ migrationId })) return [];
    await this.mediaModel.createIndexes();
    await this.questionModel.createIndexes();
    await this.versionModel.createIndexes();
    await this.rubricModel.createIndexes();
    await this.usageModel.createIndexes();
    await this.migrationModel.create({ migrationId, appliedAt: new Date() });
    return [migrationId];
  }
}
