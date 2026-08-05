import { randomUUID } from 'node:crypto';

const correlationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

export function createCorrelationId(candidate?: string): string {
  if (candidate && correlationIdPattern.test(candidate)) {
    return candidate;
  }

  return randomUUID();
}

export function isCorrelationId(value: string): boolean {
  return correlationIdPattern.test(value);
}
