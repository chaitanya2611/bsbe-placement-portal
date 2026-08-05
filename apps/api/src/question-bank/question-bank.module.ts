import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdentityModule } from '../identity/identity.module';
import { IDENTITY_MODELS, MigrationSchema } from '../identity/identity.models';
import { ChemicalValidationService } from './chemical-validation.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaStorageService } from './media-storage.service';
import { QuestionController } from './question.controller';
import { QuestionMigrationService } from './question-migration.service';
import {
  MediaAssetSchema,
  QUESTION_MODELS,
  QuestionRubricSchema,
  QuestionSchema,
  QuestionUsageSchema,
  QuestionVersionSchema,
} from './question.models';
import { QuestionService } from './question.service';
import { RubricCryptoService } from './rubric-crypto.service';

@Module({
  imports: [
    IdentityModule,
    MongooseModule.forFeature([
      { name: QUESTION_MODELS.mediaAsset, schema: MediaAssetSchema },
      { name: QUESTION_MODELS.question, schema: QuestionSchema },
      { name: QUESTION_MODELS.questionVersion, schema: QuestionVersionSchema },
      { name: QUESTION_MODELS.questionRubric, schema: QuestionRubricSchema },
      { name: QUESTION_MODELS.questionUsage, schema: QuestionUsageSchema },
      { name: IDENTITY_MODELS.migration, schema: MigrationSchema },
    ]),
  ],
  controllers: [MediaController, QuestionController],
  providers: [
    ChemicalValidationService,
    MediaService,
    MediaStorageService,
    QuestionMigrationService,
    QuestionService,
    RubricCryptoService,
  ],
  exports: [
    MongooseModule,
    MediaService,
    QuestionMigrationService,
    QuestionService,
    RubricCryptoService,
  ],
})
export class QuestionBankModule {}
