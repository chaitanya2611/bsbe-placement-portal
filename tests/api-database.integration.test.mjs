import assert from 'node:assert/strict';
import test from 'node:test';

const databaseIntegrationEnabled = process.env.RUN_DATABASE_INTEGRATION === 'true';

test(
  'API readiness reports a real MongoDB replica-set connection',
  { skip: !databaseIntegrationEnabled },
  async (context) => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_ENABLED = 'true';
    process.env.MONGODB_URI =
      process.env.MONGODB_URI ??
      'mongodb://localhost:27017/bsbe_portal?replicaSet=rs0&directConnection=true';
    process.env.OPENAPI_ENABLED = 'false';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';

    const { createApplication } = await import('../apps/api/dist/bootstrap.js');
    const app = await createApplication();
    await app.listen(0, '127.0.0.1');
    context.after(async () => app.close());

    const address = app.getHttpServer().address();
    assert.equal(typeof address, 'object');
    assert.ok(address);
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health/ready`);
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.status, 'ok');
    assert.equal(report.checks.database.status, 'ok');
  },
);
