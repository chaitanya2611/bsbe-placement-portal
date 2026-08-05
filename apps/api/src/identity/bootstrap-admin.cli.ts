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
  const email = argument('email');
  const name = argument('name');
  if (!email || !name) {
    throw new Error('Usage: pnpm bootstrap:admin -- --email admin@example.com --name "Full Name"');
  }
  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: new JsonLogger(process.env.NODE_ENV ?? 'development'),
  });
  try {
    await application.get(MigrationService).run();
    const user = await application.get(BootstrapAdminService).bootstrap(email, name);
    process.stdout.write(`Initial administrator created: ${user.email} (${user.publicId})\n`);
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Administrator bootstrap failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
