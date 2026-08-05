import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Types } = apiRequire('mongoose');
const {
  questionDefinitionSchema,
  safeQuestionVersionSchema,
} = require('../packages/contracts/dist/index.js');
const {
  MediaAssetSchema,
  QuestionRubricSchema,
  QuestionUsageSchema,
  QuestionVersionSchema,
} = require('../apps/api/dist/question-bank/question.models.js');
const { RubricCryptoService } = require('../apps/api/dist/question-bank/rubric-crypto.service.js');
const {
  ChemicalValidationService,
} = require('../apps/api/dist/question-bank/chemical-validation.service.js');
const { MediaStorageService } = require('../apps/api/dist/question-bank/media-storage.service.js');
const { parseApiEnvironment } = require('../packages/config/dist/index.js');

const baseQuestion = {
  type: 'single-choice',
  prompt: 'Which option is correct?',
  marks: 2,
  negativeMarks: 0.5,
  difficulty: 'medium',
  tags: ['cell-biology'],
  explanation: 'A protected explanation.',
  mediaIds: [],
  options: [
    { id: 'A', text: 'Alpha' },
    { id: 'B', text: 'Beta' },
  ],
  answer: { optionId: 'A' },
};

test('question contracts validate each grading mode and exact-set semantics', () => {
  assert.equal(questionDefinitionSchema.safeParse(baseQuestion).success, true);
  assert.equal(
    questionDefinitionSchema.safeParse({
      ...baseQuestion,
      type: 'multiple-select',
      answer: { optionIds: ['A', 'B'] },
    }).success,
    true,
  );
  assert.equal(
    questionDefinitionSchema.safeParse({
      ...baseQuestion,
      type: 'true-false',
      options: undefined,
      answer: { value: true },
    }).success,
    true,
  );
  assert.equal(
    questionDefinitionSchema.safeParse({
      ...baseQuestion,
      type: 'numerical',
      options: undefined,
      answer: { value: 7.2, toleranceMode: 'relative', tolerance: 0.01 },
      numerical: { unit: 'mol/L', decimalPlaces: 2 },
    }).success,
    true,
  );
});

test('question contracts reject invalid answers, duplicate IDs, and unsafe tolerances', () => {
  assert.equal(
    questionDefinitionSchema.safeParse({ ...baseQuestion, answer: { optionId: 'Z' } }).success,
    false,
  );
  assert.equal(
    questionDefinitionSchema.safeParse({
      ...baseQuestion,
      options: [
        { id: 'A', text: 'One' },
        { id: 'A', text: 'Two' },
      ],
    }).success,
    false,
  );
  assert.equal(
    questionDefinitionSchema.safeParse({
      ...baseQuestion,
      type: 'numerical',
      options: undefined,
      answer: { value: 4, toleranceMode: 'exact', tolerance: 1 },
      numerical: { unit: '' },
    }).success,
    false,
  );
});

test('student-safe question contract has no answer field', () => {
  assert.equal(Object.hasOwn(safeQuestionVersionSchema.shape, 'answer'), false);
  assert.equal(Object.hasOwn(safeQuestionVersionSchema.shape, 'rubric'), false);
  assert.equal(Object.hasOwn(safeQuestionVersionSchema.shape, 'correctOptionId'), false);
});

test('rubrics use authenticated encryption bound to one immutable question version', () => {
  const keys = {
    v1: Buffer.alloc(32, 11).toString('base64'),
    v2: Buffer.alloc(32, 12).toString('base64'),
  };
  const values = {
    QUESTION_RUBRIC_ACTIVE_KEY_VERSION: 'v2',
    QUESTION_RUBRIC_KEYS_JSON: keys,
  };
  const crypto = new RubricCryptoService({ get: (key) => values[key] });
  const versionId = new Types.ObjectId();
  const answer = { optionIds: ['A', 'C'] };
  const encrypted = crypto.encrypt(versionId, answer);

  assert.equal(encrypted.algorithm, 'aes-256-gcm');
  assert.equal(encrypted.keyVersion, 'v2');
  assert.equal(Buffer.from(encrypted.iv, 'base64').length, 12);
  assert.equal(Buffer.from(encrypted.authTag, 'base64').length, 16);
  assert.equal(encrypted.ciphertext.includes('optionIds'), false);
  assert.deepEqual(crypto.decrypt(versionId, encrypted), answer);
  assert.throws(() => crypto.decrypt(new Types.ObjectId(), encrypted));
  assert.throws(() =>
    crypto.decrypt(versionId, {
      ...encrypted,
      ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA`,
    }),
  );
});

test('question persistence separates hidden rubric data from immutable versions', () => {
  assert.equal(QuestionVersionSchema.path('prompt').options.immutable, true);
  assert.equal(QuestionVersionSchema.path('versionNumber').options.immutable, true);
  assert.equal(QuestionRubricSchema.path('ciphertext').options.select, false);
  assert.equal(QuestionRubricSchema.path('iv').options.select, false);
  assert.equal(QuestionRubricSchema.path('authTag').options.select, false);
  assert.equal(MediaAssetSchema.path('storageKey').options.select, false);
  assert.equal(MediaAssetSchema.path('sha256').options.select, false);

  assert.ok(
    QuestionVersionSchema.indexes().some(
      ([keys, options]) => keys.questionId === 1 && keys.versionNumber === 1 && options.unique,
    ),
  );
  assert.ok(
    QuestionRubricSchema.indexes().some(
      ([keys, options]) => keys.questionVersionId === 1 && options.unique,
    ),
  );
  assert.ok(
    QuestionUsageSchema.indexes().some(
      ([keys, options]) =>
        keys.questionVersionId === 1 && keys.examVersionPublicId === 1 && options.unique,
    ),
  );
});

test('chemical structures are parsed and bounded before persistence', async () => {
  const chemistry = new ChemicalValidationService();
  await chemistry.validate({ format: 'smiles', source: 'CC(=O)O' });
  await assert.rejects(
    chemistry.validate({ format: 'smiles', source: 'this is not a molecule {' }),
    (error) => error?.response?.code === 'CHEMICAL_STRUCTURE_INVALID',
  );
});

test('private media storage rejects traversal and unsupported storage keys', async () => {
  const values = {
    MEDIA_LOCAL_ROOT: 'tmp/question-media-security-test',
    MEDIA_STORAGE_DRIVER: 'local',
  };
  const storage = new MediaStorageService({ get: (key) => values[key] });
  await assert.rejects(storage.get('../secrets.webp'), /Invalid media storage key/);
  await assert.rejects(storage.get('media/asset.svg'), /Invalid media storage key/);
  await assert.rejects(storage.put('/absolute.webp', Buffer.from('x'), 'image/webp'));
});

test('production rejects local media storage even with independent rubric and identity keys', () => {
  const productionKey = Buffer.alloc(32, 41).toString('base64');
  assert.throws(() =>
    parseApiEnvironment({
      NODE_ENV: 'production',
      INSTITUTE_EMAIL_DOMAIN: 'institute.edu',
      OTP_PEPPER: 'production-otp-key-with-at-least-thirty-two-characters',
      SESSION_TOKEN_PEPPER: 'production-session-key-with-at-least-thirty-two-characters',
      CSRF_SECRET: 'production-csrf-key-with-at-least-thirty-two-characters',
      IP_HASH_KEY: 'production-ip-key-with-at-least-thirty-two-characters',
      QUESTION_RUBRIC_KEYS_JSON: JSON.stringify({ 'production-v1': productionKey }),
      QUESTION_RUBRIC_ACTIVE_KEY_VERSION: 'production-v1',
      MEDIA_STORAGE_DRIVER: 'local',
    }),
  );
});
