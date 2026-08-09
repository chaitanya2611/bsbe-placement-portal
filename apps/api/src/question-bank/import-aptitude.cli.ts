import { questionDefinitionSchema } from '@bsbe/contracts';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Request } from 'express';
import type { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { JsonLogger } from '../common/json.logger';
import { IDENTITY_MODELS, type UserRecord } from '../identity/identity.models';
import { aptitudeQuestionBank } from './aptitude-question-bank.data';
import { QUESTION_MODELS, type QuestionRecord } from './question.models';
import { QuestionService } from './question.service';

async function main(): Promise<void> {
  if (!process.argv.includes('--apply')) {
    process.stdout.write(
      `Dry run: ${aptitudeQuestionBank.length} aptitude questions are ready. Pass --apply to import them.\n`,
    );
    return;
  }

  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: new JsonLogger(process.env.NODE_ENV ?? 'development'),
  });
  try {
    const userModel = application.get<Model<UserRecord>>(getModelToken(IDENTITY_MODELS.user));
    const questionModel = application.get<Model<QuestionRecord>>(
      getModelToken(QUESTION_MODELS.question),
    );
    const questionService = application.get(QuestionService);
    const admin = await userModel.findOne({ role: 'admin', status: 'active' }).exec();
    if (!admin) throw new Error('An active administrator is required before importing questions');

    const request = {
      headers: {},
      ip: '127.0.0.1',
      get: () => undefined,
    } as unknown as Request;
    let created = 0;
    let skipped = 0;

    for (const seed of aptitudeQuestionBank) {
      if (await questionModel.exists({ tags: seed.code })) {
        skipped += 1;
        continue;
      }
      const definition = questionDefinitionSchema.parse(seed.definition);
      await questionService.create(definition, admin, request);
      created += 1;
    }

    process.stdout.write(
      `Aptitude question import completed: ${created} created, ${skipped} already present.\n`,
    );
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Aptitude question import failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
