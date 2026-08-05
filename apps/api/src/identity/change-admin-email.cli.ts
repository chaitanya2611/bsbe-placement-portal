import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { JsonLogger } from '../common/json.logger';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { MigrationService } from './migration.service';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const currentEmail = argument('from');
  const newEmail = argument('to');
  if (!currentEmail || !newEmail) {
    throw new Error(
      'Usage: pnpm admin:change-email -- --from current@example.com --to new@example.com',
    );
  }

  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: new JsonLogger(process.env.NODE_ENV ?? 'development'),
  });
  try {
    await application.get(MigrationService).run();
    const user = await application.get(BootstrapAdminService).changeEmail(currentEmail, newEmail);
    process.stdout.write(`Administrator email changed to ${user.email} (${user.publicId})\n`);
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Administrator email change failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
