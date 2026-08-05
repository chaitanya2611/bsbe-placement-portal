import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function canonicalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hmacHex(key: string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function hashSessionToken(pepper: string, token: string): string {
  return createHash('sha256').update(pepper).update('\0').update(token).digest('hex');
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function emailBelongsToDomain(email: string, configuredDomain: string): boolean {
  const canonicalEmail = canonicalizeEmail(email);
  const domain = configuredDomain.trim().toLowerCase().replace(/^@/, '');
  const atIndex = canonicalEmail.lastIndexOf('@');
  return atIndex > 0 && canonicalEmail.slice(atIndex + 1) === domain;
}

export interface OtpChallengeState {
  expiresAt: Date;
  consumedAt?: Date;
  invalidatedAt?: Date;
  lockedAt?: Date;
}

export function otpChallengeCanBeVerified(challenge: OtpChallengeState, now: Date): boolean {
  return (
    challenge.expiresAt > now &&
    !challenge.consumedAt &&
    !challenge.invalidatedAt &&
    !challenge.lockedAt
  );
}

export function nextOtpAttempt(
  currentAttempts: number,
  maximumAttempts: number,
): { attempts: number; locked: boolean } {
  const attempts = currentAttempts + 1;
  return { attempts, locked: attempts >= maximumAttempts };
}
