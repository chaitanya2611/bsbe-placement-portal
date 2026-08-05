import { type ApiEnvironment } from '@bsbe/config';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { CookieOptions } from 'express';
import type { Connection, Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  IDENTITY_MODELS,
  type SessionDocument,
  type SessionRecord,
  type UserDocument,
} from './identity.models';
import { generateOpaqueToken, hashSessionToken } from './security.util';

export interface CreatedSession {
  token: string;
  session: SessionDocument;
  user: UserDocument;
  replacedSessionPublicId?: string | undefined;
}

@Injectable()
export class SessionService {
  constructor(
    @InjectModel(IDENTITY_MODELS.session)
    private readonly sessionModel: Model<SessionRecord>,
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async createForUser(user: UserDocument): Promise<CreatedSession> {
    const token = generateOpaqueToken();
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const idleExpiresAt = new Date(
      now.getTime() + this.config.get('SESSION_IDLE_TTL_SECONDS', { infer: true }) * 1000,
    );
    const absoluteExpiresAt = new Date(
      now.getTime() + this.config.get('SESSION_ABSOLUTE_TTL_SECONDS', { infer: true }) * 1000,
    );
    let created: SessionDocument | undefined;
    let replacedSessionPublicId: string | undefined;

    await this.connection.transaction(async (databaseSession) => {
      if (user.role === 'student') {
        const existing = await this.sessionModel
          .findOne({ userId: user._id, active: true })
          .session(databaseSession)
          .exec();
        if (existing?.activeAttemptId) {
          throw new ConflictException({
            code: 'ACTIVE_EXAM_SESSION',
            message: 'Authentication cannot move devices during an active examination',
          });
        }
        if (
          existing &&
          this.config.get('STUDENT_CONCURRENT_LOGIN_POLICY', { infer: true }) === 'reject'
        ) {
          throw new ConflictException({
            code: 'ACTIVE_SESSION_EXISTS',
            message: 'An active session already exists for this account',
          });
        }
        if (existing) {
          replacedSessionPublicId = existing.publicId;
          await this.sessionModel.updateOne(
            { _id: existing._id, active: true },
            {
              $set: {
                active: false,
                revokedAt: now,
                revocationReason: 'Replaced by a new authenticated session',
              },
            },
            { session: databaseSession },
          );
        }
      }

      const documents = await this.sessionModel.create(
        [
          {
            publicId: randomUUID(),
            tokenHash,
            userId: user._id,
            role: user.role,
            active: true,
            deviceSessionId: randomUUID(),
            securityRevision: user.securityRevision,
            authenticatedAt: now,
            stepUpAt: now,
            lastSeenAt: now,
            idleExpiresAt,
            absoluteExpiresAt,
            expiresAt: idleExpiresAt < absoluteExpiresAt ? idleExpiresAt : absoluteExpiresAt,
          },
        ],
        { session: databaseSession },
      );
      created = documents[0];
    });

    if (!created) throw new Error('Session transaction completed without a session');
    return { token, session: created, user, replacedSessionPublicId };
  }

  async authenticate(token: string): Promise<SessionDocument | null> {
    const now = new Date();
    const session = await this.sessionModel
      .findOne({ tokenHash: this.hashToken(token), active: true, expiresAt: { $gt: now } })
      .exec();
    if (!session) return null;

    const idleExpiresAt = new Date(
      now.getTime() + this.config.get('SESSION_IDLE_TTL_SECONDS', { infer: true }) * 1000,
    );
    session.lastSeenAt = now;
    session.idleExpiresAt = idleExpiresAt;
    session.expiresAt =
      idleExpiresAt < session.absoluteExpiresAt ? idleExpiresAt : session.absoluteExpiresAt;
    await session.save();
    return session;
  }

  async revokeCurrent(session: SessionDocument, reason = 'User logout'): Promise<void> {
    await this.revokeById(session.publicId, reason);
  }

  async revokeById(publicId: string, reason: string): Promise<SessionDocument> {
    const session = await this.sessionModel.findOneAndUpdate(
      { publicId, active: true },
      { $set: { active: false, revokedAt: new Date(), revocationReason: reason } },
      { new: true },
    );
    if (!session) {
      throw new UnauthorizedException({
        code: 'SESSION_NOT_FOUND',
        message: 'Active session not found',
      });
    }
    return session;
  }

  async revokeAllForUser(userId: UserDocument['_id'], reason: string): Promise<number> {
    const result = await this.sessionModel.updateMany(
      { userId, active: true },
      { $set: { active: false, revokedAt: new Date(), revocationReason: reason } },
    );
    return result.modifiedCount;
  }

  async markStepUp(session: SessionDocument): Promise<void> {
    const now = new Date();
    await this.sessionModel.updateOne(
      { _id: session._id, active: true },
      { $set: { stepUpAt: now } },
    );
    session.stepUpAt = now;
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      path: '/',
      maxAge: this.config.get('SESSION_ABSOLUTE_TTL_SECONDS', { infer: true }) * 1000,
    };
  }

  cookieName(): string {
    return this.config.get('SESSION_COOKIE_NAME', { infer: true });
  }

  private hashToken(token: string): string {
    return hashSessionToken(this.config.get('SESSION_TOKEN_PEPPER', { infer: true }), token);
  }
}
