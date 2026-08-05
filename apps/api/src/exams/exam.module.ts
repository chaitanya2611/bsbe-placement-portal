import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdentityModule } from '../identity/identity.module';
import { IDENTITY_MODELS, MigrationSchema } from '../identity/identity.models';
import { QuestionBankModule } from '../question-bank/question-bank.module';
import {
  AnswerSchema,
  AttemptSchema,
  EXAM_MODELS,
  ExamSchema,
  ExamVersionSchema,
  NotificationSchema,
  ResultSchema,
} from './exam.models';
import { ExamAdminController, StudentExamController } from './exam.controller';
import { ExamMigrationService } from './exam-migration.service';
import { ExamService } from './exam.service';

@Module({
  imports: [
    IdentityModule,
    QuestionBankModule,
    MongooseModule.forFeature([
      { name: EXAM_MODELS.exam, schema: ExamSchema },
      { name: EXAM_MODELS.examVersion, schema: ExamVersionSchema },
      { name: EXAM_MODELS.attempt, schema: AttemptSchema },
      { name: EXAM_MODELS.answer, schema: AnswerSchema },
      { name: EXAM_MODELS.result, schema: ResultSchema },
      { name: EXAM_MODELS.notification, schema: NotificationSchema },
      { name: IDENTITY_MODELS.migration, schema: MigrationSchema },
    ]),
  ],
  controllers: [ExamAdminController, StudentExamController],
  providers: [ExamService, ExamMigrationService],
  exports: [ExamMigrationService, ExamService],
})
export class ExamModule {}
