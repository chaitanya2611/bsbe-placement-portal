import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  constantTimeEqual,
  emailBelongsToDomain,
  generateOtp,
  nextOtpAttempt,
  otpChallengeCanBeVerified,
} = require('../apps/api/dist/identity/security.util.js');
const { roleHasPermissions } = require('../apps/api/dist/identity/access-control.js');
const { CsrfService } = require('../apps/api/dist/identity/csrf.service.js');
const {
  OtpChallengeSchema,
  SessionSchema,
  UserSchema,
} = require('../apps/api/dist/identity/identity.models.js');
const { parseApiEnvironment } = require('../packages/config/dist/index.js');

test('OTP generation is always six numeric digits and is not constant', () => {
  const values = new Set(Array.from({ length: 500 }, () => generateOtp()));
  assert.ok([...values].every((value) => /^\d{6}$/.test(value)));
  assert.ok(values.size > 490);
});

test('OTP expiry, invalidation, consumption, and attempt lock are fail closed', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');
  assert.equal(otpChallengeCanBeVerified({ expiresAt: new Date(now.getTime() + 1) }, now), true);
  assert.equal(otpChallengeCanBeVerified({ expiresAt: now }, now), false);
  assert.equal(
    otpChallengeCanBeVerified({ expiresAt: new Date(now.getTime() + 1), consumedAt: now }, now),
    false,
  );
  assert.equal(
    otpChallengeCanBeVerified({ expiresAt: new Date(now.getTime() + 1), invalidatedAt: now }, now),
    false,
  );
  assert.deepEqual(nextOtpAttempt(3, 5), { attempts: 4, locked: false });
  assert.deepEqual(nextOtpAttempt(4, 5), { attempts: 5, locked: true });
});

test('institute-domain matching is exact and case-insensitive', () => {
  assert.equal(emailBelongsToDomain('Student@Institute.Edu', 'institute.edu'), true);
  assert.equal(emailBelongsToDomain('student@sub.institute.edu', 'institute.edu'), false);
  assert.equal(emailBelongsToDomain('student@institute.edu.evil.test', 'institute.edu'), false);
});

test('RBAC is deny-by-default for students', () => {
  assert.equal(roleHasPermissions('student', []), true);
  assert.equal(roleHasPermissions('student', ['user:manage']), false);
  assert.equal(roleHasPermissions('student', ['question:manage']), false);
  assert.equal(roleHasPermissions('student', ['question:rubric-read']), false);
  assert.equal(roleHasPermissions('admin', ['user:manage', 'audit:read']), true);
});

test('signed double-submit CSRF tokens reject tampering and unknown origins', () => {
  const values = {
    CSRF_COOKIE_NAME: 'bsbe_csrf',
    CSRF_SECRET: 'test-csrf-secret-with-at-least-thirty-two-characters',
    NODE_ENV: 'test',
    CORS_ALLOWED_ORIGINS: ['http://localhost:5173'],
  };
  const csrf = new CsrfService({ get: (key) => values[key] });
  let cookie;
  const response = {
    cookie: (name, value, options) => {
      cookie = { name, value, options };
    },
  };
  const token = csrf.issue(response);
  assert.equal(cookie.name, 'bsbe_csrf');
  assert.equal(cookie.options.httpOnly, false);
  assert.equal(csrf.validate(token), true);
  assert.equal(csrf.validate(`${token}x`), false);
  assert.equal(csrf.allowedOrigin('http://localhost:5173'), true);
  assert.equal(csrf.allowedOrigin('https://attacker.test'), false);
  assert.equal(constantTimeEqual(token, token), true);
});

test('identity indexes encode uniqueness, TTL cleanup, and one active student session', () => {
  const userIndexes = UserSchema.indexes();
  assert.ok(userIndexes.some(([keys, options]) => keys.email === 1 && options.unique));
  assert.ok(
    userIndexes.some(
      ([keys, options]) =>
        keys.rollNumber === 1 && options.unique && options.partialFilterExpression,
    ),
  );
  const otpIndexes = OtpChallengeSchema.indexes();
  assert.ok(
    otpIndexes.some(([keys, options]) => keys.deleteAt === 1 && options.expireAfterSeconds === 0),
  );
  const sessionIndexes = SessionSchema.indexes();
  assert.ok(
    sessionIndexes.some(
      ([keys, options]) =>
        keys.userId === 1 && options.unique && options.partialFilterExpression?.role === 'student',
    ),
  );
});

test('production rejects development cryptographic secrets', () => {
  assert.throws(() =>
    parseApiEnvironment({ NODE_ENV: 'production', INSTITUTE_EMAIL_DOMAIN: 'institute.edu' }),
  );
});
