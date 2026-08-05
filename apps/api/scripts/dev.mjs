import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiDirectory = fileURLToPath(new URL('../', import.meta.url));
const tscPath = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));

const initialBuild = spawnSync(
  process.execPath,
  [tscPath, '-p', 'tsconfig.build.json', '--pretty'],
  {
    cwd: apiDirectory,
    stdio: 'inherit',
  },
);

if (initialBuild.status !== 0) {
  process.exit(initialBuild.status ?? 1);
}

const compiler = spawn(
  process.execPath,
  [tscPath, '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'],
  { cwd: apiDirectory, stdio: 'inherit' },
);
const server = spawn(process.execPath, ['--watch', '--enable-source-maps', 'dist/main.js'], {
  cwd: apiDirectory,
  stdio: 'inherit',
});

function stopChildren(signal) {
  compiler.kill(signal);
  server.kill(signal);
}

process.on('SIGINT', () => stopChildren('SIGINT'));
process.on('SIGTERM', () => stopChildren('SIGTERM'));

for (const child of [compiler, server]) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      stopChildren('SIGTERM');
      process.exitCode = code;
    }
  });
}
