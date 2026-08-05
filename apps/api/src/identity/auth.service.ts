import type { AccountSummary, OtpRequestResponse, Program, SessionSummary } from '@bsbe/contracts';
import { type ApiEnvironment } from '@bsbe/config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import type { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AuditService } from './audit.service';
import {
  IDENTITY_MODELS,
  type OtpChallengeDocument,
  type OtpChallengeRecord,
  type ProgramRecord,
  type SessionDocument,
  type UserDocument,
  type UserRecord,
} from './identity.models';
import { OtpMailerService } from './otp-mailer.service';
import {
  canonicalizeEmail,
  constantTimeEqual,
  emailBelongsToDomain,
  generateOtp,
  hmacHex,
  nextOtpAttempt,
  otpChallengeCanBeVerified,
} from './security.util';
import { SessionService, type CreatedSession } from './session.service';

const genericOtpMessage =
  'If the account is eligible, a verification code will be sent. Use only the latest code.';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(IDENTITY_MODELS.user) private readonly userModel: Model<UserRecord>,
    @InjectModel(IDENTITY_MODELS.program) private readonly programModel: Model<ProgramRecord>,
    @InjectModel(IDENTITY_MODELS.otpChallenge)
    private readonly challengeModel: Model<OtpChallengeRecord>,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly mailer: OtpMailerService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async requestLoginOtp(emailInput: string, request: Request): Promise<OtpRequestResponse> {
    const email = canonicalizeEmail(emailInput);
    const user = await this.findEligibleUser(email);
    return this.requestOtp(email, user, 'login', request);
  }

  async requestStepUpOtp(user: UserDocument, request: Request): Promise<OtpRequestResponse> {
    return this.requestOtp(user.email, user, 'step-up', request);
  }

  async verifyLoginOtp(
    challengeId: string,
    otp: string,
    request: Request,
  ): Promise<CreatedSession> {
    const user = await this.consumeChallenge(challengeId, otp, 'login', undefined, request);
    try {
      const created = await this.sessions.createForUser(user);
      await this.audit.record({
        eventType: 'authentication.succeeded',
        actorUserId: user._id,
        actorRole: user.role,
        targetType: 'session',
        targetPublicId: created.session.publicId,
        outcome: 'success',
        request,
      });
      try {
        await this.mailer.sendAuthenticationNotice(user.email);
      } catch {
        await this.audit.record({
          eventType: 'authentication.notification-failed',
          actorUserId: user._id,
          actorRole: user.role,
          targetType: 'session',
          targetPublicId: created.session.publicId,
          outcome: 'failure',
          reason: 'SMTP delivery failed',
          request,
        });
      }
      if (created.replacedSessionPublicId) {
        await this.audit.record({
          eventType: 'session.revoked',
          actorUserId: user._id,
          actorRole: user.role,
          targetType: 'session',
          targetPublicId: created.replacedSessionPublicId,
          outcome: 'success',
          reason: 'Concurrent login replacement policy',
          request,
        });
      }
      return created;
    } catch (error) {
      await this.audit.record({
        eventType: 'concurrent-login.rejected',
        actorUserId: user._id,
        actorRole: user.role,
        outcome: 'rejected',
        reason: error instanceof Error ? error.message.slice(0, 240) : 'Session creation rejected',
        request,
      });
      throw error;
    }
  }

  async verifyStepUpOtp(
    challengeId: string,
    otp: string,
    session: SessionDocument,
    user: UserDocument,
    request: Request,
  ): Promise<void> {
    await this.consumeChallenge(challengeId, otp, 'step-up', user._id, request);
    await this.sessions.markStepUp(session);
    await this.audit.record({
      eventType: 'authentication.step-up-succeeded',
      actorUserId: user._id,
      actorRole: user.role,
      targetType: 'session',
      targetPublicId: session.publicId,
      outcome: 'success',
      request,
    });
  }

  async sessionSummary(user: UserDocument, session: SessionDocument): Promise<SessionSummary> {
    const recentAge = this.config.get('RECENT_AUTH_MAX_AGE_SECONDS', { infer: true }) * 1000;
    return {
      user: await this.accountSummary(user),
      authenticatedAt: session.authenticatedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      recentAuthentication: Date.now() - session.stepUpAt.getTime() <= recentAge,
    };
  }

  async accountSummary(user: UserDocument): Promise<AccountSummary> {
    let program: Program | null = null;
    if (user.programId) {
      const record = await this.programModel.findById(user.programId).exec();
      if (record) {
        program = {
          id: record.publicId,
          code: record.code,
          name: record.name,
          active: record.active,
        };
      }
    }
    return {
      id: user.publicId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      rollNumber: user.rollNumber ?? null,
      program,
    };
  }

  private async requestOtp(
    email: string,
    user: UserDocument | null,
    purpose: 'login' | 'step-up',
    request: Request,
  ): Promise<OtpRequestResponse> {
    const now = new Date();
    const publicId = randomUUID();
    const emailKey = hmacHex(this.config.get('OTP_PEPPER', { infer: true }), `email:${email}`);
    const ipKey = this.audit.hashIp(request.ip);
    const rateWindow = new Date(
      now.getTime() - this.config.get('OTP_RATE_WINDOW_SECONDS', { infer: true }) * 1000,
    );
    const cooldownSince = new Date(
      now.getTime() - this.config.get('OTP_REQUEST_COOLDOWN_SECONDS', { infer: true }) * 1000,
    );
    const lockoutSince = new Date(
      now.getTime() - this.config.get('OTP_LOCKOUT_SECONDS', { infer: true }) * 1000,
    );
    const [emailCount, ipCount, recent, locked] = await Promise.all([
      this.challengeModel.countDocuments({ emailKey, requestedAt: { $gte: rateWindow } }),
      this.challengeModel.countDocuments({ ipKey, requestedAt: { $gte: rateWindow } }),
      this.challengeModel.exists({ emailKey, purpose, requestedAt: { $gte: cooldownSince } }),
      this.challengeModel.exists({ emailKey, lockedAt: { $gte: lockoutSince } }),
    ]);
    const limited =
      Boolean(recent) ||
      Boolean(locked) ||
      emailCount >= this.config.get('OTP_MAX_REQUESTS_PER_EMAIL', { infer: true }) ||
      ipCount >= this.config.get('OTP_MAX_REQUESTS_PER_IP', { infer: true });

    if (limited) {
      await this.audit.record({
        eventType: 'otp.request-rejected',
        actorUserId: user?._id,
        actorRole: user?.role ?? 'anonymous',
        outcome: 'rejected',
        reason: 'OTP request rate limit or cooldown',
        request,
      });
      return this.genericResponse(publicId);
    }

    const otp = generateOtp();
    const expiresAt = new Date(
      now.getTime() + this.config.get('OTP_TTL_SECONDS', { infer: true }) * 1000,
    );
    const cleanupSeconds = Math.max(
      this.config.get('OTP_TTL_SECONDS', { infer: true }),
      this.config.get('OTP_RATE_WINDOW_SECONDS', { infer: true }),
      this.config.get('OTP_LOCKOUT_SECONDS', { infer: true }),
    );
    await this.challengeModel.updateMany(
      { emailKey, purpose, consumedAt: { $exists: false }, invalidatedAt: { $exists: false } },
      { $set: { invalidatedAt: now } },
    );
    await this.challengeModel.create({
      publicId,
      emailKey,
      ipKey,
      userId: user?._id,
      purpose,
      otpHash: this.hashOtp(publicId, otp),
      verifyAttempts: 0,
      expiresAt,
      deleteAt: new Date(now.getTime() + cleanupSeconds * 1000),
      requestedAt: now,
    });

    let outcome: 'success' | 'failure' = 'success';
    let reason: string | undefined;
    if (user) {
      try {
        await this.mailer.sendLoginOtp(
          user.email,
          otp,
          this.config.get('OTP_TTL_SECONDS', { infer: true }),
        );
      } catch {
        outcome = 'failure';
        reason = 'SMTP delivery failed';
        await this.challengeModel.updateOne({ publicId }, { $set: { invalidatedAt: new Date() } });
      }
    }
    await this.audit.record({
      eventType: 'otp.requested',
      actorUserId: user?._id,
      actorRole: user?.role ?? 'anonymous',
      targetType: 'otp-challenge',
      targetPublicId: publicId,
      outcome,
      reason,
      request,
    });
    return this.genericResponse(publicId);
  }

  private async consumeChallenge(
    publicId: string,
    otp: string,
    purpose: 'login' | 'step-up',
    expectedUserId: Types.ObjectId | undefined,
    request: Request,
  ): Promise<UserDocument> {
    const now = new Date();
    const challenge = await this.challengeModel
      .findOne({ publicId, purpose })
      .select('+otpHash')
      .exec();
    const invalid =
      !challenge ||
      !otpChallengeCanBeVerified(challenge, now) ||
      !challenge.userId ||
      (expectedUserId && !challenge.userId.equals(expectedUserId));

    if (invalid) {
      await this.auditVerificationFailure(challenge, request, 'Challenge is invalid or expired');
      throw this.invalidOtpError();
    }

    const matches = constantTimeEqual(challenge.otpHash, this.hashOtp(publicId, otp));
    if (!matches) {
      const nextAttempt = nextOtpAttempt(
        challenge.verifyAttempts,
        this.config.get('OTP_MAX_VERIFY_ATTEMPTS', { infer: true }),
      );
      await this.challengeModel.updateOne(
        {
          _id: challenge._id,
          verifyAttempts: challenge.verifyAttempts,
          consumedAt: { $exists: false },
        },
        {
          $inc: { verifyAttempts: 1 },
          ...(nextAttempt.locked ? { $set: { lockedAt: now } } : {}),
        },
      );
      await this.auditVerificationFailure(challenge, request, 'Incorrect verification code');
      throw this.invalidOtpError();
    }

    const claimed = await this.challengeModel.findOneAndUpdate(
      {
        _id: challenge._id,
        consumedAt: { $exists: false },
        invalidatedAt: { $exists: false },
        lockedAt: { $exists: false },
        expiresAt: { $gt: now },
      },
      { $set: { consumedAt: now } },
      { new: true },
    );
    if (!claimed) throw this.invalidOtpError();
    const user = await this.userModel.findById(challenge.userId).exec();
    if (!user || user.status !== 'active') {
      await this.auditVerificationFailure(challenge, request, 'Account is unavailable');
      throw this.invalidOtpError();
    }
    await this.audit.record({
      eventType: 'otp.verified',
      actorUserId: user._id,
      actorRole: user.role,
      targetType: 'otp-challenge',
      targetPublicId: publicId,
      outcome: 'success',
      request,
    });
    return user;
  }

  private async findEligibleUser(email: string): Promise<UserDocument | null> {
    const user = await this.userModel.findOne({ email, status: 'active' }).exec();
    if (!user) return null;
    if (
      user.role === 'student' &&
      !emailBelongsToDomain(email, this.config.get('INSTITUTE_EMAIL_DOMAIN', { infer: true }))
    ) {
      return null;
    }
    return user;
  }

  private hashOtp(challengeId: string, otp: string): string {
    return hmacHex(this.config.get('OTP_PEPPER', { infer: true }), `otp:${challengeId}:${otp}`);
  }

  private genericResponse(challengeId: string): OtpRequestResponse {
    return {
      challengeId,
      expiresInSeconds: this.config.get('OTP_TTL_SECONDS', { infer: true }),
      message: genericOtpMessage,
    };
  }

  private invalidOtpError(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'OTP_INVALID',
      message: 'The verification code is invalid or expired',
    });
  }

  private async auditVerificationFailure(
    challenge: OtpChallengeDocument | null,
    request: Request,
    reason: string,
  ): Promise<void> {
    await this.audit.record({
      eventType: 'otp.verification-failed',
      actorUserId: challenge?.userId,
      actorRole: challenge?.userId ? undefined : 'anonymous',
      targetType: 'otp-challenge',
      targetPublicId: challenge?.publicId,
      outcome: 'failure',
      reason,
      request,
    });
  }
}
