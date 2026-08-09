import { spawn } from 'node:child_process';
import { join } from 'node:path';

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
