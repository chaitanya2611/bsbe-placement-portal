import { Schema, type HydratedDocument, type Types } from 'mongoose';

export type UserRole = 'student' | 'admin';
export type AccountStatus = 'active' | 'inactive';

export interface ProgramRecord {
  publicId: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRecord {
  publicId: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: AccountStatus;
  rollNumber?: string;
  programId?: Types.ObjectId;
  securityRevision: number;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface OtpChallengeRecord {
  publicId: string;
  emailKey: string;
  ipKey: string;
  userId?: Types.ObjectId;
  purpose: 'login' | 'step-up';
  otpHash: string;
  verifyAttempts: number;
  expiresAt: Date;
  deleteAt: Date;
  consumedAt?: Date;
  invalidatedAt?: Date;
  lockedAt?: Date;
  requestedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  publicId: string;
  tokenHash: string;
  userId: Types.ObjectId;
  role: UserRole;
  active: boolean;
  deviceSessionId: string;
  securityRevision: number;
  authenticatedAt: Date;
  stepUpAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revocationReason?: string;
  activeAttemptId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditEventRecord {
  publicId: string;
  eventType: string;
  actorUserId?: Types.ObjectId;
  actorRole?: UserRole | 'system' | 'anonymous';
  targetType?: string;
  targetPublicId?: string;
  outcome: 'success' | 'failure' | 'rejected';
  reason?: string;
  correlationId?: string;
  ipHash?: string;
  userAgent?: string;
  metadata?: Record<string, string | number | boolean>;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MigrationRecord {
  migrationId: string;
  appliedAt: Date;
}

export type ProgramDocument = HydratedDocument<ProgramRecord>;
export type UserDocument = HydratedDocument<UserRecord>;
export type OtpChallengeDocument = HydratedDocument<OtpChallengeRecord>;
export type SessionDocument = HydratedDocument<SessionRecord>;
export type AuditEventDocument = HydratedDocument<AuditEventRecord>;

const safeSchemaOptions = {
  timestamps: true,
  strict: 'throw' as const,
  versionKey: false as const,
};

export const ProgramSchema = new Schema<ProgramRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    active: { type: Boolean, required: true, default: true },
  },
  safeSchemaOptions,
);
ProgramSchema.index({ publicId: 1 }, { unique: true, name: 'uq_program_public_id' });
ProgramSchema.index({ code: 1 }, { unique: true, name: 'uq_program_code' });

export const UserSchema = new Schema<UserRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    fullName: { type: String, required: true, trim: true, maxlength: 160 },
    role: { type: String, enum: ['student', 'admin'], required: true },
    status: { type: String, enum: ['active', 'inactive'], required: true, default: 'active' },
    rollNumber: { type: String, trim: true, uppercase: true, maxlength: 64 },
    programId: { type: Schema.Types.ObjectId, ref: 'Program' },
    securityRevision: { type: Number, required: true, default: 1, min: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  safeSchemaOptions,
);
UserSchema.index({ publicId: 1 }, { unique: true, name: 'uq_user_public_id' });
UserSchema.index({ email: 1 }, { unique: true, name: 'uq_user_email' });
UserSchema.index(
  { rollNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'student', rollNumber: { $type: 'string' } },
    name: 'uq_student_roll_number',
  },
);
UserSchema.index({ role: 1, status: 1, fullName: 1 }, { name: 'ix_user_admin_list' });

export const OtpChallengeSchema = new Schema<OtpChallengeRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    emailKey: { type: String, required: true, immutable: true },
    ipKey: { type: String, required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', immutable: true },
    purpose: { type: String, enum: ['login', 'step-up'], required: true, immutable: true },
    otpHash: { type: String, required: true, select: false },
    verifyAttempts: { type: Number, required: true, default: 0, min: 0 },
    expiresAt: { type: Date, required: true, immutable: true },
    deleteAt: { type: Date, required: true, immutable: true },
    consumedAt: Date,
    invalidatedAt: Date,
    lockedAt: Date,
    requestedAt: { type: Date, required: true, immutable: true },
  },
  safeSchemaOptions,
);
OtpChallengeSchema.index({ publicId: 1 }, { unique: true, name: 'uq_otp_public_id' });
OtpChallengeSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_otp_cleanup' });
OtpChallengeSchema.index(
  { emailKey: 1, purpose: 1, requestedAt: -1 },
  { name: 'ix_otp_email_rate' },
);
OtpChallengeSchema.index({ ipKey: 1, requestedAt: -1 }, { name: 'ix_otp_ip_rate' });

export const SessionSchema = new Schema<SessionRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    tokenHash: { type: String, required: true, immutable: true, select: false },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    role: { type: String, enum: ['student', 'admin'], required: true, immutable: true },
    active: { type: Boolean, required: true, default: true },
    deviceSessionId: { type: String, required: true, immutable: true },
    securityRevision: { type: Number, required: true, immutable: true },
    authenticatedAt: { type: Date, required: true, immutable: true },
    stepUpAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revocationReason: { type: String, maxlength: 240 },
    activeAttemptId: { type: Schema.Types.ObjectId },
  },
  safeSchemaOptions,
);
SessionSchema.index({ publicId: 1 }, { unique: true, name: 'uq_session_public_id' });
SessionSchema.index({ tokenHash: 1 }, { unique: true, name: 'uq_session_token_hash' });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_session_expiry' });
SessionSchema.index({ userId: 1, active: 1 }, { name: 'ix_session_user_active' });
SessionSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'student', active: true },
    name: 'uq_active_student_session',
  },
);

export const AuditEventSchema = new Schema<AuditEventRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    eventType: { type: String, required: true, immutable: true, maxlength: 100 },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', immutable: true },
    actorRole: { type: String, enum: ['student', 'admin', 'system', 'anonymous'], immutable: true },
    targetType: { type: String, maxlength: 80, immutable: true },
    targetPublicId: { type: String, maxlength: 100, immutable: true },
    outcome: {
      type: String,
      enum: ['success', 'failure', 'rejected'],
      required: true,
      immutable: true,
    },
    reason: { type: String, maxlength: 240, immutable: true },
    correlationId: { type: String, maxlength: 128, immutable: true },
    ipHash: { type: String, immutable: true },
    userAgent: { type: String, maxlength: 300, immutable: true },
    metadata: { type: Schema.Types.Mixed, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
  },
  safeSchemaOptions,
);
AuditEventSchema.index({ publicId: 1 }, { unique: true, name: 'uq_audit_public_id' });
AuditEventSchema.index({ occurredAt: -1, eventType: 1 }, { name: 'ix_audit_timeline' });
AuditEventSchema.index({ actorUserId: 1, occurredAt: -1 }, { name: 'ix_audit_actor' });
AuditEventSchema.index(
  { targetType: 1, targetPublicId: 1, occurredAt: -1 },
  { name: 'ix_audit_target' },
);

export const MigrationSchema = new Schema<MigrationRecord>(
  {
    migrationId: { type: String, required: true, immutable: true },
    appliedAt: { type: Date, required: true, immutable: true },
  },
  { versionKey: false, collection: 'portal_migrations' },
);
MigrationSchema.index({ migrationId: 1 }, { unique: true, name: 'uq_migration_id' });

export const IDENTITY_MODELS = {
  auditEvent: 'AuditEvent',
  migration: 'Migration',
  otpChallenge: 'OtpChallenge',
  program: 'Program',
  session: 'Session',
  user: 'User',
} as const;
