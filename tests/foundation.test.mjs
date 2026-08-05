import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { healthCheckSchema } = require('../packages/contracts/dist/index.js');
const { parseApiEnvironment } = require('../packages/config/dist/index.js');
const { createCorrelationId, isCorrelationId } = require('../packages/shared/dist/index.js');
const { SeedRunner } = require('../apps/api/dist/seed/seed.runner.js');

test('environment parser applies safe development defaults', () => {
  const environment = parseApiEnvironment({});
  assert.equal(environment.API_PORT, 3000);
  assert.equal(environment.DISPLAY_TIMEZONE, 'Asia/Kolkata');
  assert.deepEqual(environment.CORS_ALLOWED_ORIGINS, ['http://localhost:5173']);
  assert.equal(environment.DATABASE_ENABLED, true);
});

test('environment parser rejects wildcard credentialed CORS', () => {
  assert.throws(() => parseApiEnvironment({ CORS_ALLOWED_ORIGINS: '*' }));
});

test('production environment rejects the placeholder institute domain', () => {
  assert.throws(() => parseApiEnvironment({ NODE_ENV: 'production' }));
});

test('correlation IDs accept safe callers and replace unsafe values', () => {
  assert.equal(createCorrelationId('request-12345678'), 'request-12345678');
  const generated = createCorrelationId('bad value');
  assert.equal(isCorrelationId(generated), true);
});

test('health contract accepts a well-formed report', () => {
  const result = healthCheckSchema.safeParse({
    status: 'ok',
    checkedAt: new Date().toISOString(),
    service: 'bsbe-api',
    version: '0.2.0',
    checks: { process: { status: 'ok' } },
  });
  assert.equal(result.success, true);
});

test('seed runner rejects duplicate task IDs', () => {
  const task = { id: 'duplicate', description: 'test', run: async () => undefined };
  assert.throws(() => new SeedRunner([task, task]), /unique/);
});

test('seed runner dry-run lists tasks without executing them', async () => {
  let executed = false;
  const runner = new SeedRunner([
    {
      id: 'foundation',
      description: 'Foundation seed task',
      run: async () => {
        executed = true;
      },
    },
  ]);
  const result = await runner.run({ dryRun: true, log: () => undefined });
  assert.equal(executed, false);
  assert.deepEqual(result.executedTaskIds, ['foundation']);
});
