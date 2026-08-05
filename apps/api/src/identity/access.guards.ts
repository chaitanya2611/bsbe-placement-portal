import { type ApiEnvironment } from '@bsbe/config';
import {
  CanActivate,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  RECENT_AUTH_KEY,
  roleHasPermissions,
  type Permission,
} from './access-control';
import { IDENTITY_MODELS, type UserRecord } from './identity.models';
import { type AuthenticatedRequest, parseCookies } from './request-context';
import { SessionService } from './session.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    @InjectModel(IDENTITY_MODELS.user) private readonly userModel: Model<UserRecord>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = parseCookies(request.headers.cookie)[
      this.config.get('SESSION_COOKIE_NAME', { infer: true })
    ];
    const session = token ? await this.sessions.authenticate(token) : null;
    if (!session) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }
    const user = await this.userModel.findById(session.userId).exec();
    if (!user || user.status !== 'active' || user.securityRevision !== session.securityRevision) {
      await this.sessions.revokeCurrent(session, 'Account status or security revision changed');
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'Session is no longer valid',
      });
    }
    request.authentication = { session, user };
    return true;
  }
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permissions?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      !request.authentication ||
      !roleHasPermissions(request.authentication.user.role, permissions)
    ) {
      throw new ForbiddenException({ code: 'ACCESS_DENIED', message: 'Access denied' });
    }
    return true;
  }
}

@Injectable()
export class RecentAuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(RECENT_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const stepUpAt = request.authentication?.session.stepUpAt;
    const maxAge = this.config.get('RECENT_AUTH_MAX_AGE_SECONDS', { infer: true }) * 1000;
    if (!stepUpAt || Date.now() - stepUpAt.getTime() > maxAge) {
      throw new ForbiddenException({
        code: 'RECENT_AUTHENTICATION_REQUIRED',
        message: 'Fresh OTP verification is required for this action',
      });
    }
    return true;
  }
}
