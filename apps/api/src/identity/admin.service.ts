import type { ApiEnvironment } from '@bsbe/config';
import type { AccountSummary, Program } from '@bsbe/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import type { Model, RootFilterQuery } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AuditService } from './audit.service';
import { AuthService } from './auth.service';
import type {
  CreateProgramDto,
  CreateUserDto,
  SetProgramStatusDto,
  UpdateAccountStatusDto,
} from './identity.dto';
import {
  IDENTITY_MODELS,
  type ProgramDocument,
  type ProgramRecord,
  type SessionRecord,
  type UserDocument,
  type UserRecord,
} from './identity.models';
import type { AuthenticatedRequest } from './request-context';
import { canonicalizeCode, canonicalizeEmail, emailBelongsToDomain } from './security.util';
import { SessionService } from './session.service';
import { ConfigService } from '@nestjs/config';
export interface AdminSessionSummary {
  id: string;
  active: boolean;
  deviceSessionId: string;
  authenticatedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(IDENTITY_MODELS.program) private readonly programModel: Model<ProgramRecord>,
    @InjectModel(IDENTITY_MODELS.user) private readonly userModel: Model<UserRecord>,
    @InjectModel(IDENTITY_MODELS.session) private readonly sessionModel: Model<SessionRecord>,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  async listPrograms(): Promise<Program[]> {
    const programs = await this.programModel.find().sort({ code: 1 }).exec();
    return programs.map((program) => this.programResponse(program));
  }

  async createProgram(
    body: CreateProgramDto,
    actor: UserDocument,
    request: Request,
  ): Promise<Program> {
    try {
      const program = await this.programModel.create({
        publicId: randomUUID(),
        code: canonicalizeCode(body.code),
        name: body.name.trim(),
        active: true,
      });
      await this.audit.record({
        eventType: 'program.created',
        actorUserId: actor._id,
        actorRole: actor.role,
        targetType: 'program',
        targetPublicId: program.publicId,
        outcome: 'success',
        request,
      });
      return this.programResponse(program);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException({
          code: 'PROGRAM_EXISTS',
          message: 'Program code already exists',
        });
      }
      throw error;
    }
  }

  async setProgramStatus(
    publicId: string,
    body: SetProgramStatusDto,
    actor: UserDocument,
    request: Request,
  ): Promise<Program> {
    const program = await this.programModel.findOneAndUpdate(
      { publicId },
      { $set: { active: body.active } },
      { new: true },
    );
    if (!program)
      throw new NotFoundException({ code: 'PROGRAM_NOT_FOUND', message: 'Program not found' });
    await this.audit.record({
      eventType: 'program.status-changed',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'program',
      targetPublicId: publicId,
      outcome: 'success',
      reason: body.reason,
      metadata: { active: body.active },
      request,
    });
    return this.programResponse(program);
  }

  async listUsers(limit: number, search?: string): Promise<AccountSummary[]> {
    const query: RootFilterQuery<UserRecord> = {};
    if (search) {
      const safeSearch = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ fullName: safeSearch }, { email: safeSearch }, { rollNumber: safeSearch }];
    }
    const users = await this.userModel.find(query).sort({ createdAt: -1 }).limit(limit).exec();
    return Promise.all(users.map((user) => this.auth.accountSummary(user)));
  }

  async createUser(
    body: CreateUserDto,
    actor: UserDocument,
    request: Request,
  ): Promise<AccountSummary> {
    const email = canonicalizeEmail(body.email);
    if (
      body.role === 'student' &&
      !emailBelongsToDomain(email, this.config.get('INSTITUTE_EMAIL_DOMAIN', { infer: true }))
    ) {
      throw new BadRequestException({
        code: 'INSTITUTE_EMAIL_REQUIRED',
        message: 'Candidate email must use the configured institute domain',
      });
    }
    let program: ProgramDocument | null = null;
    if (body.role === 'student') {
      if (!body.rollNumber || !body.programId) {
        throw new BadRequestException({
          code: 'STUDENT_FIELDS_REQUIRED',
          message: 'Students require a roll number and active program',
        });
      }
      program = await this.programModel.findOne({ publicId: body.programId, active: true }).exec();
      if (!program) {
        throw new BadRequestException({
          code: 'PROGRAM_INVALID',
          message: 'Active program not found',
        });
      }
    } else if (body.rollNumber || body.programId) {
      throw new BadRequestException({
        code: 'ADMIN_STUDENT_FIELDS_FORBIDDEN',
        message: 'Administrator accounts do not use roll number or program fields',
      });
    }

    try {
      const user = await this.userModel.create({
        publicId: randomUUID(),
        email,
        fullName: body.fullName.trim(),
        role: body.role,
        status: 'active',
        rollNumber: body.role === 'student' ? canonicalizeCode(body.rollNumber!) : undefined,
        programId: program?._id,
        securityRevision: 1,
        createdBy: actor._id,
      });
      await this.audit.record({
        eventType: 'account.created',
        actorUserId: actor._id,
        actorRole: actor.role,
        targetType: 'user',
        targetPublicId: user.publicId,
        outcome: 'success',
        metadata: { role: user.role },
        request,
      });
      return this.auth.accountSummary(user);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException({
          code: 'ACCOUNT_IDENTIFIER_EXISTS',
          message: 'Email or roll number already exists',
        });
      }
      throw error;
    }
  }

  async updateAccountStatus(
    publicId: string,
    body: UpdateAccountStatusDto,
    request: AuthenticatedRequest,
  ): Promise<AccountSummary> {
    const actor = request.authentication!.user;
    if (actor.publicId === publicId && body.status === 'inactive') {
      throw new ForbiddenException({
        code: 'SELF_DEACTIVATION_FORBIDDEN',
        message: 'Use another administrator',
      });
    }
    const user = await this.userModel.findOneAndUpdate(
      { publicId },
      { $set: { status: body.status }, $inc: { securityRevision: 1 } },
      { new: true },
    );
    if (!user)
      throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' });
    if (body.status === 'inactive') {
      await this.sessions.revokeAllForUser(user._id, `Account deactivated: ${body.reason}`);
    }
    await this.audit.record({
      eventType: body.status === 'active' ? 'account.activated' : 'account.deactivated',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'user',
      targetPublicId: publicId,
      outcome: 'success',
      reason: body.reason,
      request,
    });
    return this.auth.accountSummary(user);
  }

  async revokeSession(
    sessionPublicId: string,
    reason: string,
    request: AuthenticatedRequest,
  ): Promise<void> {
    if (request.authentication!.session.publicId === sessionPublicId) {
      throw new ForbiddenException({
        code: 'CURRENT_SESSION_REVOKE_FORBIDDEN',
        message: 'Use logout to revoke the current session',
      });
    }
    const revoked = await this.sessions.revokeById(sessionPublicId, reason);
    await this.audit.record({
      eventType: 'session.revoked',
      actorUserId: request.authentication!.user._id,
      actorRole: request.authentication!.user.role,
      targetType: 'session',
      targetPublicId: sessionPublicId,
      outcome: 'success',
      reason,
      metadata: { targetRole: revoked.role },
      request,
    });
  }

  async listSessionsForUser(userPublicId: string): Promise<AdminSessionSummary[]> {
    const user = await this.userModel.findOne({ publicId: userPublicId }).exec();
    if (!user)
      throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' });
    const sessions = await this.sessionModel
      .find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
    return sessions.map((session) => ({
      id: session.publicId,
      active: session.active,
      deviceSessionId: session.deviceSessionId,
      authenticatedAt: session.authenticatedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null,
      revocationReason: session.revocationReason ?? null,
    }));
  }

  private programResponse(program: ProgramDocument): Program {
    return { id: program.publicId, code: program.code, name: program.name, active: program.active };
  }
}
