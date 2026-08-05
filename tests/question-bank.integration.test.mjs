import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const integrationEnabled = process.env.RUN_QUESTION_INTEGRATION === 'true';

test(
  'real question-bank lifecycle isolates rubrics and preserves immutable versions',
  { skip: !integrationEnabled, timeout: 90_000 },
  async (context) => {
    const suffix = randomUUID().replaceAll('-', '');
    const databaseName = `bsbe_question_test_${suffix}`;
    const mediaRoot = `tmp/question-media-${suffix}`;
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
    process.env.OTP_PEPPER = 'question-otp-pepper-at-least-thirty-two-characters';
    process.env.SESSION_TOKEN_PEPPER = 'question-session-pepper-at-least-thirty-two-characters';
    process.env.CSRF_SECRET = 'question-csrf-secret-at-least-thirty-two-characters';
    process.env.IP_HASH_KEY = 'question-ip-hash-key-at-least-thirty-two-characters';
    process.env.MEDIA_STORAGE_DRIVER = 'local';
    process.env.MEDIA_LOCAL_ROOT = mediaRoot;
    process.env.QUESTION_RUBRIC_ACTIVE_KEY_VERSION = 'integration-v1';
    process.env.QUESTION_RUBRIC_KEYS_JSON = JSON.stringify({
      'integration-v1': Buffer.alloc(32, 29).toString('base64'),
    });

    const { getConnectionToken, getModelToken } = apiRequire('@nestjs/mongoose');
    const { createApplication } = await import('../apps/api/dist/bootstrap.js');
    const { IDENTITY_MODELS } = require('../apps/api/dist/identity/identity.models.js');
    const { QUESTION_MODELS } = require('../apps/api/dist/question-bank/question.models.js');
    const {
      BootstrapAdminService,
    } = require('../apps/api/dist/identity/bootstrap-admin.service.js');
    const {
      QuestionMigrationService,
    } = require('../apps/api/dist/question-bank/question-migration.service.js');
    const sharpModule = apiRequire('sharp');
    const sharp = sharpModule.default ?? sharpModule;
    const app = await createApplication();
    await app.listen(0, '127.0.0.1');
    const connection = app.get(getConnectionToken());
    context.after(async () => {
      await connection.dropDatabase();
      await app.close();
      await rm(resolve(process.cwd(), mediaRoot), { recursive: true, force: true });
    });

    const address = app.getHttpServer().address();
    assert.equal(typeof address, 'object');
    assert.ok(address);
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    const User = app.get(getModelToken(IDENTITY_MODELS.user));
    const Challenge = app.get(getModelToken(IDENTITY_MODELS.otpChallenge));
    const Audit = app.get(getModelToken(IDENTITY_MODELS.auditEvent));
    const Media = app.get(getModelToken(QUESTION_MODELS.mediaAsset));
    const Question = app.get(getModelToken(QUESTION_MODELS.question));
    const Version = app.get(getModelToken(QUESTION_MODELS.questionVersion));
    const Rubric = app.get(getModelToken(QUESTION_MODELS.questionRubric));
    await Promise.all([
      User.init(),
      Challenge.init(),
      Audit.init(),
      Media.init(),
      Question.init(),
      Version.init(),
      Rubric.init(),
    ]);
    assert.deepEqual(await app.get(QuestionMigrationService).run(), [
      '003-question-bank-media-indexes',
    ]);
    assert.deepEqual(await app.get(QuestionMigrationService).run(), []);

    const admin = await app
      .get(BootstrapAdminService)
      .bootstrap('question-admin@institute.test', 'Question Admin');
    const session = await login(baseUrl, Challenge, admin.email, process.env.OTP_PEPPER);
    const authFetch = (path, init = {}) =>
      fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          cookie: session.cookie,
          origin: 'http://localhost:5173',
          ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
          ...(['GET', 'HEAD'].includes(init.method ?? 'GET')
            ? {}
            : { 'x-csrf-token': session.csrfToken }),
          ...init.headers,
        },
      });

    const invalidMedia = new FormData();
    invalidMedia.set(
      'file',
      new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/png' }),
      'pretend.png',
    );
    assert.equal(
      (await authFetch('/admin/media', { method: 'POST', body: invalidMedia })).status,
      400,
    );

    const png = await sharp({
      create: { width: 32, height: 24, channels: 3, background: '#24547d' },
    })
      .png()
      .toBuffer();
    const mediaForm = new FormData();
    mediaForm.set('file', new Blob([png], { type: 'image/png' }), '../unsafe-name.png');
    const mediaResponse = await authFetch('/admin/media', { method: 'POST', body: mediaForm });
    const mediaResponseError =
      mediaResponse.status === 201 ? undefined : await mediaResponse.clone().text();
    assert.equal(mediaResponse.status, 201, mediaResponseError);
    const media = await mediaResponse.json();
    assert.equal(media.contentType, 'image/webp');
    assert.equal(media.fileName, 'unsafe-name.png');
    assert.equal(media.width, 32);
    assert.equal(media.height, 24);

    const definition = {
      type: 'multiple-select',
      prompt: 'Select the $ATP$-producing pathways.',
      marks: 3,
      negativeMarks: 1,
      difficulty: 'medium',
      tags: ['metabolism', 'atp'],
      explanation: 'Both choices contribute under the stated conditions.',
      mediaIds: [media.id],
      chemicalStructure: { format: 'smiles', source: 'CC(=O)O' },
      options: [
        { id: 'A', text: 'Glycolysis' },
        { id: 'B', text: 'Oxidative phosphorylation' },
        { id: 'C', text: 'Passive diffusion' },
      ],
      answer: { optionIds: ['A', 'B'] },
    };
    const createResponse = await authFetch('/admin/questions', {
      method: 'POST',
      body: JSON.stringify(definition),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.version, 1);
    assertSafeQuestion(created);

    const storedQuestion = await Question.findOne({ publicId: created.questionId }).exec();
    assert.ok(storedQuestion);
    const firstVersion = await Version.findById(storedQuestion.currentVersionId).exec();
    assert.ok(firstVersion);
    assert.equal(Object.hasOwn(firstVersion.toObject(), 'answer'), false);
    const storedRubric = await Rubric.findOne({ questionVersionId: firstVersion._id })
      .select('+ciphertext +iv +authTag')
      .exec();
    assert.ok(storedRubric);
    assert.equal(storedRubric.ciphertext.includes('optionIds'), false);

    const unsafeAnswer = await authFetch('/admin/questions', {
      method: 'POST',
      body: JSON.stringify({ ...definition, answer: { optionIds: ['Z'] } }),
    });
    assert.equal(unsafeAnswer.status, 400);

    const updateResponse = await authFetch(`/admin/questions/${created.questionId}`, {
      method: 'PUT',
      body: JSON.stringify({
        expectedVersion: 1,
        definition: { ...definition, prompt: 'Updated immutable version prompt.' },
      }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.version, 2);
    assertSafeQuestion(updated);
    assert.equal(await Version.countDocuments({ questionId: storedQuestion._id }), 2);
    assert.equal((await Version.findById(firstVersion._id).lean()).prompt, definition.prompt);

    const staleUpdate = await authFetch(`/admin/questions/${created.questionId}`, {
      method: 'PUT',
      body: JSON.stringify({ expectedVersion: 1, definition }),
    });
    assert.equal(staleUpdate.status, 409);

    const listResponse = await authFetch('/admin/questions?search=immutable&status=draft');
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).length, 1);
    const cloneResponse = await authFetch(`/admin/questions/${created.questionId}/clone`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const cloneResponseError =
      cloneResponse.status === 201 ? undefined : await cloneResponse.clone().text();
    assert.equal(cloneResponse.status, 201, cloneResponseError);
    const clone = await cloneResponse.json();
    assert.notEqual(clone.questionId, created.questionId);
    assertSafeQuestion(clone);

    const rubricResponse = await authFetch(`/admin/questions/${created.questionId}/rubric`);
    assert.equal(rubricResponse.status, 200);
    assert.deepEqual((await rubricResponse.json()).answer, definition.answer);
    const historyResponse = await authFetch(`/admin/questions/${created.questionId}/history`);
    assert.equal(historyResponse.status, 200);
    assert.equal((await historyResponse.json()).versions.length, 2);

    const archiveResponse = await authFetch(`/admin/questions/${created.questionId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived', reason: 'Integration test cleanup' }),
    });
    assert.equal(archiveResponse.status, 200);
    assert.equal((await archiveResponse.json()).status, 'archived');
    assert.equal((await authFetch(`/admin/media/${media.id}`, { method: 'DELETE' })).status, 409);
    assert.ok(await Audit.exists({ eventType: 'question.created', actorUserId: admin._id }));
    assert.ok(
      await Audit.exists({ eventType: 'question.rubric-revealed', actorUserId: admin._id }),
    );
  },
);

function assertSafeQuestion(question) {
  const serialized = JSON.stringify(question);
  assert.equal(Object.hasOwn(question, 'answer'), false);
  assert.equal(serialized.includes('optionIds'), false);
  assert.equal(serialized.includes('ciphertext'), false);
  assert.equal(serialized.includes('authTag'), false);
}

async function login(baseUrl, Challenge, email, pepper) {
  const jar = new Map();
  const captureCookies = (response) => {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const separator = pair.indexOf('=');
      jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  };
  const cookie = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  const initialCsrf = await fetch(`${baseUrl}/auth/csrf`);
  captureCookies(initialCsrf);
  const { csrfToken } = await initialCsrf.json();
  const request = await fetch(`${baseUrl}/auth/otp/request`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookie(),
      origin: 'http://localhost:5173',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ email }),
  });
  assert.equal(request.status, 202);
  const { challengeId } = await request.json();
  const otp = await recoverTestCode(Challenge, challengeId, pepper);
  const verification = await fetch(`${baseUrl}/auth/otp/verify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookie(),
      origin: 'http://localhost:5173',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ challengeId, otp }),
  });
  assert.equal(verification.status, 200);
  captureCookies(verification);
  const rotated = await fetch(`${baseUrl}/auth/csrf`, { headers: { cookie: cookie() } });
  captureCookies(rotated);
  return { cookie: cookie(), csrfToken: (await rotated.json()).csrfToken };
}

async function recoverTestCode(Challenge, challengeId, pepper) {
  const challenge = await Challenge.findOne({ publicId: challengeId }).select('+otpHash').exec();
  assert.ok(challenge);
  for (let value = 0; value < 1_000_000; value += 1) {
    const otp = value.toString().padStart(6, '0');
    const hash = createHmac('sha256', pepper).update(`otp:${challengeId}:${otp}`).digest('hex');
    if (hash === challenge.otpHash) return otp;
  }
  throw new Error('Test code could not be recovered');
}
