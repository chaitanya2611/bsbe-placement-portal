import type { Request } from 'express';
import type { SessionDocument, UserDocument } from './identity.models';

export interface AuthenticatedRequest extends Request {
  authentication?: {
    session: SessionDocument;
    user: UserDocument;
  };
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      continue;
    }
  }
  return cookies;
}
