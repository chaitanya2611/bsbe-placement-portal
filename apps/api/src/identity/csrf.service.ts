import { type ApiEnvironment } from '@bsbe/config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { constantTimeEqual, generateOpaqueToken, hmacHex } from './security.util';

@Injectable()
export class CsrfService {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}

  issue(response: Response): string {
    const nonce = generateOpaqueToken(24);
    const token = `${nonce}.${this.sign(nonce)}`;
    response.cookie(this.config.get('CSRF_COOKIE_NAME', { infer: true }), token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      path: '/',
      maxAge: 12 * 60 * 60 * 1000,
    });
    return token;
  }

  validate(token: string): boolean {
    const separator = token.indexOf('.');
    if (separator < 1) return false;
    const nonce = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    return nonce.length >= 20 && constantTimeEqual(signature, this.sign(nonce));
  }

  allowedOrigin(origin: string | undefined): boolean {
    if (!origin) return false;
    return this.config.get('CORS_ALLOWED_ORIGINS', { infer: true }).includes(origin);
  }

  private sign(nonce: string): string {
    return hmacHex(this.config.get('CSRF_SECRET', { infer: true }), `csrf:${nonce}`);
  }
}
