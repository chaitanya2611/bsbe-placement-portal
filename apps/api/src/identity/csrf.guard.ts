import { CanActivate, ForbiddenException, Injectable, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@bsbe/config';
import type { Request } from 'express';
import { CsrfService } from './csrf.service';
import { parseCookies } from './request-context';
import { constantTimeEqual } from './security.util';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly csrf: CsrfService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (safeMethods.has(request.method.toUpperCase())) return true;

    const cookieName = this.config.get('CSRF_COOKIE_NAME', { infer: true });
    const cookieToken = parseCookies(request.headers.cookie)[cookieName];
    const header = request.get('x-csrf-token');
    if (
      !cookieToken ||
      !header ||
      !constantTimeEqual(cookieToken, header) ||
      !this.csrf.validate(header) ||
      !this.csrf.allowedOrigin(request.get('origin'))
    ) {
      throw new ForbiddenException({
        code: 'CSRF_REJECTED',
        message: 'Request verification failed',
      });
    }
    return true;
  }
}
