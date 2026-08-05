import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { JsonLogger } from '../common/json.logger';
import { MigrationService } from './migration.service';
import { QuestionMigrationService } from '../question-bank/question-migration.service';
import { ExamMigrationService } from '../exams/exam-migration.service';

async function main(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: new JsonLogger(process.env.NODE_ENV ?? 'development'),
  });
  try {
    const applied = [
      ...(await application.get(MigrationService).run()),
      ...(await application.get(QuestionMigrationService).run()),
      ...(await application.get(ExamMigrationService).run()),
    ];
    process.stdout.write(
      applied.length ? `Applied migrations: ${applied.join(', ')}\n` : 'No pending migrations.\n',
    );
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Migration failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
