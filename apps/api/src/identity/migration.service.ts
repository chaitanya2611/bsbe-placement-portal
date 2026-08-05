import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  IDENTITY_MODELS,
  type AuditEventRecord,
  type MigrationRecord,
  type OtpChallengeRecord,
  type ProgramRecord,
  type SessionRecord,
  type UserRecord,
} from './identity.models';

@Injectable()
export class MigrationService {
  constructor(
    @InjectModel(IDENTITY_MODELS.migration) private readonly migrationModel: Model<MigrationRecord>,
    @InjectModel(IDENTITY_MODELS.program) private readonly programModel: Model<ProgramRecord>,
    @InjectModel(IDENTITY_MODELS.user) private readonly userModel: Model<UserRecord>,
    @InjectModel(IDENTITY_MODELS.otpChallenge)
    private readonly otpModel: Model<OtpChallengeRecord>,
    @InjectModel(IDENTITY_MODELS.session) private readonly sessionModel: Model<SessionRecord>,
    @InjectModel(IDENTITY_MODELS.auditEvent)
    private readonly auditModel: Model<AuditEventRecord>,
  ) {}

  async run(): Promise<string[]> {
    const migrationId = '002-identity-access-indexes';
    const alreadyApplied = await this.migrationModel.exists({ migrationId });
    if (alreadyApplied) return [];

    await this.migrationModel.createIndexes();
    await this.programModel.createIndexes();
    await this.userModel.createIndexes();
    await this.otpModel.createIndexes();
    await this.sessionModel.createIndexes();
    await this.auditModel.createIndexes();
    await this.migrationModel.create({ migrationId, appliedAt: new Date() });
    return [migrationId];
  }
}
