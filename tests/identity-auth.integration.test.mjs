import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const integrationEnabled = process.env.RUN_IDENTITY_INTEGRATION === 'true';

test(
  'real MongoDB identity lifecycle enforces CSRF, RBAC, OTP use, audit, and one student session',
  { skip: !integrationEnabled, timeout: 60_000 },
  async (context) => {
    const databaseName = `bsbe_identity_test_${randomUUID().replaceAll('-', '')}`;
    const baseUri =
      process.env.MONGODB_URI ??
      'mongodb://localhost:27017/bsbe_portal?replicaSet=rs0&directConnection=true';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_ENABLED = 'true';
    process.env.MONGODB_URI = baseUri.replace(/\/[^/?]+(?=\?)/, `/${databaseName}`);
    process.env.OPENAPI_ENABLED = 'false';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';
    process.env.INSTITUTE_EMAIL_DOMAIN = 'institute.test';
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1025';
    process.env.OTP_PEPPER = 'integration-otp-pepper-at-least-thirty-two-characters';
    process.env.SESSION_TOKEN_PEPPER = 'integration-session-pepper-at-least-thirty-two-characters';
    process.env.CSRF_SECRET = 'integration-csrf-secret-at-least-thirty-two-characters';
    process.env.IP_HASH_KEY = 'integration-ip-hash-key-at-least-thirty-two-characters';
    process.env.OTP_REQUEST_COOLDOWN_SECONDS = '10';

    const { getConnectionToken, getModelToken } = apiRequire('@nestjs/mongoose');
    const { createApplication } = await import('../apps/api/dist/bootstrap.js');
    const { IDENTITY_MODELS } = require('../apps/api/dist/identity/identity.models.js');
    const {
      BootstrapAdminService,
    } = require('../apps/api/dist/identity/bootstrap-admin.service.js');
    const { MigrationService } = require('../apps/api/dist/identity/migration.service.js');
    const app = await createApplication();
    await app.listen(0, '127.0.0.1');
    const connection = app.get(getConnectionToken());
    context.after(async () => {
      await connection.dropDatabase();
      await app.close();
    });

    const address = app.getHttpServer().address();
    assert.equal(typeof address, 'object');
    assert.ok(address);
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    const User = app.get(getModelToken(IDENTITY_MODELS.user));
    const Program = app.get(getModelToken(IDENTITY_MODELS.program));
    const Challenge = app.get(getModelToken(IDENTITY_MODELS.otpChallenge));
    const Session = app.get(getModelToken(IDENTITY_MODELS.session));
    const Audit = app.get(getModelToken(IDENTITY_MODELS.auditEvent));
    await Promise.all([
      User.init(),
      Program.init(),
      Challenge.init(),
      Session.init(),
      Audit.init(),
    ]);
    assert.deepEqual(await app.get(MigrationService).run(), ['002-identity-access-indexes']);
    assert.deepEqual(await app.get(MigrationService).run(), []);
    const bootstrap = app.get(BootstrapAdminService);
    const initialAdmin = await bootstrap.bootstrap('initial-admin@institute.test', 'Initial Admin');
    assert.equal(initialAdmin.role, 'admin');
    const renamedAdmin = await bootstrap.changeEmail(
      initialAdmin.email,
      'initial-admin@example.test',
    );
    assert.equal(renamedAdmin.email, 'initial-admin@example.test');
    assert.equal(renamedAdmin.securityRevision, initialAdmin.securityRevision + 1);
    assert.ok(
      await Audit.exists({
        eventType: 'account.admin-email-changed',
        actorRole: 'system',
        targetPublicId: initialAdmin.publicId,
      }),
    );
    await assert.rejects(
      () => bootstrap.bootstrap('second-admin@institute.test', 'Second Admin'),
      /already exists/,
    );

    const program = await Program.create({
      publicId: randomUUID(),
      code: 'MTECH',
      name: 'M.Tech.',
      active: true,
    });
    const student = await User.create({
      publicId: randomUUID(),
      email: 'student@institute.test',
      fullName: 'Fictional Student',
      role: 'student',
      status: 'active',
      rollNumber: 'TEST001',
      programId: program._id,
      securityRevision: 1,
    });

    const jar = new Map();
    const captureCookies = (response) => {
      for (const header of response.headers.getSetCookie()) {
        const [pair] = header.split(';');
        const separator = pair.indexOf('=');
        jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    };
    const cookieHeader = (overrides = {}) =>
      [...new Map([...jar, ...Object.entries(overrides)])]
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    const csrfResponse = await fetch(`${baseUrl}/auth/csrf`);
    assert.equal(csrfResponse.status, 200);
    captureCookies(csrfResponse);
    let { csrfToken } = await csrfResponse.json();

    const post = (path, body, options = {}) =>
      fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieHeader(options.cookies),
          origin: 'http://localhost:5173',
          ...(options.csrf === false ? {} : { 'x-csrf-token': csrfToken }),
        },
        body: JSON.stringify(body),
      });

    const blockedByCsrf = await post(
      '/auth/otp/request',
      { email: student.email },
      { csrf: false },
    );
    assert.equal(blockedByCsrf.status, 403);

    const unknownRequest = await post('/auth/otp/request', { email: 'unknown@institute.test' });
    assert.equal(unknownRequest.status, 202);
    const unknownBody = await unknownRequest.json();

    const externalStudent = await User.create({
      publicId: randomUUID(),
      email: 'external-student@example.test',
      fullName: 'External Student',
      role: 'student',
      status: 'active',
      rollNumber: 'TEST002',
      programId: program._id,
      securityRevision: 1,
    });
    const blockedExternalStudentRequest = await post('/auth/otp/request', {
      email: externalStudent.email,
    });
    assert.equal(blockedExternalStudentRequest.status, 202);
    const blockedExternalStudentBody = await blockedExternalStudentRequest.json();
    assert.equal(
      await Challenge.exists({
        publicId: blockedExternalStudentBody.challengeId,
        userId: externalStudent._id,
      }),
      null,
    );

    const adminOtpRequest = await post('/auth/otp/request', { email: renamedAdmin.email });
    assert.equal(adminOtpRequest.status, 202);
    assert.ok(
      await Challenge.exists({
        publicId: (await adminOtpRequest.json()).challengeId,
        userId: renamedAdmin._id,
      }),
    );

    const otpRequest = await post('/auth/otp/request', { email: student.email });
    assert.equal(otpRequest.status, 202);
    const requestBody = await otpRequest.json();
    assert.deepEqual(Object.keys(requestBody).sort(), Object.keys(unknownBody).sort());
    const firstCode = await recoverTestCode(
      Challenge,
      requestBody.challengeId,
      process.env.OTP_PEPPER,
    );

    const fixationToken = 'attacker-supplied-session-token';
    const verification = await post(
      '/auth/otp/verify',
      { challengeId: requestBody.challengeId, otp: firstCode },
      { cookies: { bsbe_session: fixationToken } },
    );
    assert.equal(verification.status, 200);
    captureCookies(verification);
    assert.notEqual(jar.get('bsbe_session'), fixationToken);
    const firstSessionToken = jar.get('bsbe_session');
    assert.ok(firstSessionToken);
    const rotatedCsrfResponse = await fetch(`${baseUrl}/auth/csrf`, {
      headers: { cookie: cookieHeader() },
    });
    captureCookies(rotatedCsrfResponse);
    ({ csrfToken } = await rotatedCsrfResponse.json());

    const sessionResponse = await fetch(`${baseUrl}/auth/session`, {
      headers: { cookie: cookieHeader() },
    });
    assert.equal(sessionResponse.status, 200);
    const sessionBody = await sessionResponse.json();
    assert.equal(sessionBody.user.id, student.publicId);
    assert.equal(sessionBody.user.role, 'student');

    const forbiddenAdmin = await fetch(`${baseUrl}/admin/users`, {
      headers: { cookie: cookieHeader() },
    });
    assert.equal(forbiddenAdmin.status, 403);

    await Challenge.collection.updateOne(
      { publicId: requestBody.challengeId },
      { $set: { requestedAt: new Date(Date.now() - 11_000) } },
    );
    const secondRequest = await post('/auth/otp/request', { email: student.email });
    assert.equal(secondRequest.status, 202);
    const secondBody = await secondRequest.json();
    const secondCode = await recoverTestCode(
      Challenge,
      secondBody.challengeId,
      process.env.OTP_PEPPER,
    );
    const secondVerification = await post('/auth/otp/verify', {
      challengeId: secondBody.challengeId,
      otp: secondCode,
    });
    assert.equal(secondVerification.status, 200);
    captureCookies(secondVerification);
    assert.notEqual(jar.get('bsbe_session'), firstSessionToken);
    assert.equal(await Session.countDocuments({ userId: student._id, active: true }), 1);

    const oldSessionResponse = await fetch(`${baseUrl}/auth/session`, {
      headers: { cookie: cookieHeader({ bsbe_session: firstSessionToken }) },
    });
    assert.equal(oldSessionResponse.status, 401);
    assert.ok(
      await Audit.exists({ eventType: 'authentication.succeeded', actorUserId: student._id }),
    );
    assert.ok(await Audit.exists({ eventType: 'session.revoked', actorUserId: student._id }));
    assert.equal(await Audit.exists({ eventType: 'otp.verification-failed' }), null);
  },
);

async function recoverTestCode(Challenge, challengeId, pepper) {
  const challenge = await Challenge.findOne({ publicId: challengeId }).select('+otpHash').exec();
  assert.ok(challenge);
  for (let value = 0; value < 1_000_000; value += 1) {
    const otp = value.toString().padStart(6, '0');
    const hash = createHmac('sha256', pepper).update(`otp:${challengeId}:${otp}`).digest('hex');
    if (hash === challenge.otpHash) return otp;
  }
  throw new Error('Test code could not be recovered from the one-million-value OTP space');
}
