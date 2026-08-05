import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { IDENTITY_MODELS, type MigrationRecord } from '../identity/identity.models';
import {
  EXAM_MODELS,
  type AnswerRecord,
  type AttemptRecord,
  type ExamRecord,
  type ExamVersionRecord,
  type NotificationRecord,
  type ResultRecord,
} from './exam.models';

@Injectable()
export class ExamMigrationService {
  constructor(
    @InjectModel(IDENTITY_MODELS.migration) private readonly migrations: Model<MigrationRecord>,
    @InjectModel(EXAM_MODELS.exam) private readonly exams: Model<ExamRecord>,
    @InjectModel(EXAM_MODELS.examVersion) private readonly versions: Model<ExamVersionRecord>,
    @InjectModel(EXAM_MODELS.attempt) private readonly attempts: Model<AttemptRecord>,
    @InjectModel(EXAM_MODELS.answer) private readonly answers: Model<AnswerRecord>,
    @InjectModel(EXAM_MODELS.result) private readonly results: Model<ResultRecord>,
    @InjectModel(EXAM_MODELS.notification)
    private readonly notifications: Model<NotificationRecord>,
  ) {}
  async run(): Promise<string[]> {
    const migrationId = '005-exam-workflow-production-fields';
    if (await this.migrations.exists({ migrationId })) return [];
    const versions = await this.versions.find({ examPublicId: { $exists: false } }).exec();
    for (const version of versions) {
      const exam = await this.exams.findById(version.examId).exec();
      if (exam)
        await this.versions.collection.updateOne(
          { _id: version._id },
          { $set: { examPublicId: exam.publicId } },
        );
    }
    await this.attempts.collection.updateMany({ startIdempotencyKey: { $exists: false } }, [
      { $set: { startIdempotencyKey: { $concat: ['legacy:', '$publicId'] } } },
    ]);
    const results = await this.results
      .find({ 'items.questionVersionId': { $exists: false } })
      .exec();
    for (const result of results) {
      const attempt = await this.attempts.findById(result.attemptId).exec();
      if (!attempt) continue;
      const versionIds = new Map(
        attempt.questionInstances.map((item) => [
          item.publicId,
          item.questionVersionId.toHexString(),
        ]),
      );
      await this.results.collection.updateOne(
        { _id: result._id },
        {
          $set: {
            items: result.items.map((item) => ({
              questionInstanceId: item.questionInstanceId,
              questionVersionId:
                item.questionVersionId ?? versionIds.get(item.questionInstanceId) ?? 'unknown',
              sectionId: item.sectionId,
              awardedMarks: item.awardedMarks,
              maximumMarks: item.maximumMarks,
              correct: item.correct,
            })),
          },
        },
      );
    }
    await Promise.all([
      this.exams.createIndexes(),
      this.versions.createIndexes(),
      this.attempts.createIndexes(),
      this.answers.createIndexes(),
      this.results.createIndexes(),
      this.notifications.createIndexes(),
    ]);
    const attemptIndexes = await this.attempts.collection.indexes();
    if (attemptIndexes.some((index) => index.name === 'uq_attempt_start_idempotency'))
      await this.attempts.collection.dropIndex('uq_attempt_start_idempotency');
    await this.migrations.create({ migrationId, appliedAt: new Date() });
    return [migrationId];
  }
}
