import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_ENABLED = 'false';
process.env.OPENAPI_ENABLED = 'true';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';

test('API exposes liveness, degraded readiness, correlation IDs, and OpenAPI', async (context) => {
  const { createApplication } = await import('../apps/api/dist/bootstrap.js');
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  context.after(async () => app.close());

  const address = app.getHttpServer().address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const origin = `http://127.0.0.1:${address.port}`;

  const live = await fetch(`${origin}/api/v1/health/live`, {
    headers: { 'X-Correlation-ID': 'integration-request-1234' },
  });
  assert.equal(live.status, 200);
  assert.equal(live.headers.get('x-correlation-id'), 'integration-request-1234');
  const liveBody = await live.json();
  assert.equal(liveBody.status, 'ok');

  const ready = await fetch(`${origin}/api/v1/health/ready`);
  assert.equal(ready.status, 503);
  const readyBody = await ready.json();
  assert.equal(readyBody.checks.database.status, 'down');

  const openApi = await fetch(`${origin}/api/docs-json`);
  assert.equal(openApi.status, 200);
  const document = await openApi.json();
  assert.equal(document.info.title, 'BSBE Placement Mock Test Portal API');
  assert.ok(document.paths['/api/v1/health/live']);
});
