import assert from 'node:assert/strict';
import test from 'node:test';
import { examLockdownConfigInputSchema } from '../packages/contracts/dist/index.js';

test('SEB lockdown configuration accepts hosted URLs and hexadecimal Config Keys', () => {
  const parsed = examLockdownConfigInputSchema.parse({
    sebConfigurationUrl: 'https://exam.example.edu/config/exam.seb',
    sebConfigKeys: ['a'.repeat(64)],
  });
  assert.equal(parsed.sebConfigKeys.length, 1);
});

test('SEB lockdown configuration rejects local paths and malformed Config Keys', () => {
  assert.equal(
    examLockdownConfigInputSchema.safeParse({
      sebConfigurationUrl: 'C:\\Users\\administrator\\exam.seb',
      sebConfigKeys: ['not-a-config-key'],
    }).success,
    false,
  );
});
