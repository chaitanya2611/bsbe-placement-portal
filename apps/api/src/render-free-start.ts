import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createConnection } from 'mongoose';

const QUESTION_POOL_RESET_ID = 'clear-question-pool-2026-08-09';

interface MaintenanceOperation {
  _id: string;
  completedAt?: Date;
  deletedQuestions?: number;
}

function runNode(script: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--enable-source-maps', script, ...args], {
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${script} exited with ${code ?? signal ?? 'an unknown status'}`));
    });
  });
}

async function resetQuestionPoolOnce(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI is required');

  const connection = await createConnection(uri).asPromise();
  try {
    const operations = connection.db!.collection<MaintenanceOperation>('maintenance_operations');
    const existing = await operations.findOne({ _id: QUESTION_POOL_RESET_ID });
    if (existing?.completedAt) return;

    // Remove only the mutable question-pool records. Immutable versions and rubrics are retained
    // because published exams and historical attempts refer to those snapshots directly.
    const result = await connection.db!.collection('questions').deleteMany({});
    await operations.updateOne(
      { _id: QUESTION_POOL_RESET_ID },
      {
        $set: {
          completedAt: new Date(),
          deletedQuestions: result.deletedCount,
        },
      },
      { upsert: true },
    );
    process.stdout.write(`Question pool reset completed: ${result.deletedCount} questions removed.\n`);
  } finally {
    await connection.close();
  }
}

async function main(): Promise<void> {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  if (!adminEmail || !adminName) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_NAME are required');
  }

  await runNode(join(__dirname, 'identity', 'migration.cli.js'));
  await runNode(join(__dirname, 'identity', 'bootstrap-admin.cli.js'), [
    '--if-missing',
    '--email',
    adminEmail,
    '--name',
    adminName,
  ]);
  await resetQuestionPoolOnce();

  const server = spawn(process.execPath, ['--enable-source-maps', join(__dirname, 'main.js')], {
    env: process.env,
    stdio: 'inherit',
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => server.kill(signal));
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', (code, signal) => {
      if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') {
        resolve();
        return;
      }
      reject(new Error(`API server exited with ${code ?? signal ?? 'an unknown status'}`));
    });
  });
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Render startup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
