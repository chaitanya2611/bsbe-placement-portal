import type { AttemptStatus, ExamStatus } from '@bsbe/contracts';
import { Schema, type HydratedDocument, type Types } from 'mongoose';

export interface ExamSectionDraft {
  publicId: string;
  title: string;
  instructions: string;
  durationSeconds: number;
  questionIds: Types.ObjectId[];
  selectCount: number;
  randomQuestionOrder: boolean;
  randomOptionOrder: boolean;
  navigation: 'free' | 'forward-only';
}

export interface GradeBoundaryRecord {
  grade: string;
  minimumPercentage: number;
}

export interface ExamRecord {
  publicId: string;
  name: string;
  description: string;
  instructions: string;
  status: ExamStatus;
  allowedProgramIds: Types.ObjectId[];
  startAt: Date;
  endEntryAt: Date;
  durationSeconds: number;
  timezone: string;
  passwordHash?: string;
  lockdownRequired: boolean;
  allowStandardBrowserFallback: boolean;
  sebConfigKeys: string[];
  sebConfigurationUrl?: string;
  showQuestionReview: boolean;
  showCorrectAnswers: boolean;
  gradeBoundaries: GradeBoundaryRecord[];
  sections: ExamSectionDraft[];
  currentVersion: number;
  publishedVersionId?: Types.ObjectId;
  publishedAt?: Date;
  cancelledAt?: Date;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExamVersionSection {
  publicId: string;
  title: string;
  instructions: string;
  durationSeconds: number;
  questionVersionIds: Types.ObjectId[];
  selectCount: number;
  randomQuestionOrder: boolean;
  randomOptionOrder: boolean;
  navigation: 'free' | 'forward-only';
}

export interface ExamVersionRecord {
  publicId: string;
  examPublicId: string;
  examId: Types.ObjectId;
  versionNumber: number;
  name: string;
  description: string;
  instructions: string;
  allowedProgramIds: Types.ObjectId[];
  startAt: Date;
  endEntryAt: Date;
  durationSeconds: number;
  timezone: string;
  lockdownRequired: boolean;
  allowStandardBrowserFallback: boolean;
  sebConfigKeys: string[];
  sebConfigurationUrl?: string;
  showQuestionReview: boolean;
  showCorrectAnswers: boolean;
  gradeBoundaries: GradeBoundaryRecord[];
  sections: ExamVersionSection[];
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export interface AttemptQuestionInstance {
  publicId: string;
  sectionId: string;
  questionVersionId: Types.ObjectId;
  order: number;
  optionOrder: string[];
  marks: number;
  negativeMarks: number;
}

export interface AttemptRecord {
  publicId: string;
  startIdempotencyKey: string;
  examId: Types.ObjectId;
  examVersionId: Types.ObjectId;
  userId: Types.ObjectId;
  sessionId: Types.ObjectId;
  deviceSessionId: string;
  status: AttemptStatus;
  randomSeed: string;
  questionInstances: AttemptQuestionInstance[];
  startedAt: Date;
  endsAt: Date;
  currentSectionIndex: number;
  sectionStartedAt: Date;
  sectionEndsAt: Date;
  lastHeartbeatAt: Date;
  offlineLeaseExpiresAt: Date;
  revision: number;
  submittedAt?: Date;
  submissionIdempotencyKey?: string;
  submissionReason?: string;
  resumedAt?: Date;
  extensionSeconds: number;
  suspiciousEventCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnswerRecord {
  attemptId: Types.ObjectId;
  questionInstanceId: string;
  sequence: number;
  answer: unknown;
  markedForReview: boolean;
  clientEventAt: Date;
  serverReceivedAt: Date;
  attemptRevision: number;
  deviceSessionId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResultItemRecord {
  questionInstanceId: string;
  questionVersionId: string;
  sectionId: string;
  awardedMarks: number;
  maximumMarks: number;
  correct: boolean;
}

export interface SectionScoreRecord {
  sectionId: string;
  title: string;
  score: number;
  maximumScore: number;
}

export interface ResultRecord {
  publicId: string;
  attemptId: Types.ObjectId;
  examId: Types.ObjectId;
  examVersionId: Types.ObjectId;
  userId: Types.ObjectId;
  version: number;
  score: number;
  maximumScore: number;
  percentage: number;
  grade: string;
  items: ResultItemRecord[];
  sectionScores: SectionScoreRecord[];
  evaluationVersion: string;
  evaluatedAt: Date;
  published: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationRecord {
  publicId: string;
  userId: Types.ObjectId;
  type:
    'exam-reminder' | 'schedule-change' | 'exam-cancelled' | 'result-published' | 'announcement';
  title: string;
  message: string;
  email: string;
  idempotencyKey: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  nextAttemptAt: Date;
  sentAt?: Date;
  lastError?: string;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ExamDocument = HydratedDocument<ExamRecord>;
export type ExamVersionDocument = HydratedDocument<ExamVersionRecord>;
export type AttemptDocument = HydratedDocument<AttemptRecord>;
export type AnswerDocument = HydratedDocument<AnswerRecord>;
export type ResultDocument = HydratedDocument<ResultRecord>;

const safeOptions = { timestamps: true, strict: 'throw' as const, versionKey: false as const };
const immutableOptions = {
  timestamps: { createdAt: true, updatedAt: false },
  strict: 'throw' as const,
  versionKey: false as const,
};

const GradeBoundarySchema = new Schema<GradeBoundaryRecord>(
  {
    grade: { type: String, required: true, maxlength: 12 },
    minimumPercentage: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false, strict: 'throw', versionKey: false },
);
const DraftSectionSchema = new Schema<ExamSectionDraft>(
  {
    publicId: { type: String, required: true },
    title: { type: String, required: true, maxlength: 160 },
    instructions: { type: String, required: true, maxlength: 10_000 },
    durationSeconds: { type: Number, required: true, min: 60 },
    questionIds: { type: [Schema.Types.ObjectId], ref: 'Question', required: true },
    selectCount: { type: Number, required: true, min: 1 },
    randomQuestionOrder: { type: Boolean, required: true },
    randomOptionOrder: { type: Boolean, required: true },
    navigation: { type: String, enum: ['free', 'forward-only'], required: true },
  },
  { _id: false, strict: 'throw', versionKey: false },
);
const VersionSectionSchema = new Schema<ExamVersionSection>(
  {
    publicId: { type: String, required: true, immutable: true },
    title: { type: String, required: true, immutable: true },
    instructions: { type: String, required: true, immutable: true },
    durationSeconds: { type: Number, required: true, immutable: true },
    questionVersionIds: {
      type: [Schema.Types.ObjectId],
      ref: 'QuestionVersion',
      required: true,
      immutable: true,
    },
    selectCount: { type: Number, required: true, immutable: true },
    randomQuestionOrder: { type: Boolean, required: true, immutable: true },
    randomOptionOrder: { type: Boolean, required: true, immutable: true },
    navigation: { type: String, enum: ['free', 'forward-only'], required: true, immutable: true },
  },
  { _id: false, strict: 'throw', versionKey: false },
);
const AttemptQuestionSchema = new Schema<AttemptQuestionInstance>(
  {
    publicId: { type: String, required: true, immutable: true },
    sectionId: { type: String, required: true, immutable: true },
    questionVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'QuestionVersion',
      required: true,
      immutable: true,
    },
    order: { type: Number, required: true, immutable: true },
    optionOrder: { type: [String], required: true, immutable: true },
    marks: { type: Number, required: true, immutable: true },
    negativeMarks: { type: Number, required: true, immutable: true },
  },
  { _id: false, strict: 'throw', versionKey: false },
);
const ResultItemSchema = new Schema<ResultItemRecord>(
  {
    questionInstanceId: String,
    questionVersionId: String,
    sectionId: String,
    awardedMarks: Number,
    maximumMarks: Number,
    correct: Boolean,
  },
  { _id: false, strict: 'throw', versionKey: false },
);
const SectionScoreSchema = new Schema<SectionScoreRecord>(
  { sectionId: String, title: String, score: Number, maximumScore: Number },
  { _id: false, strict: 'throw', versionKey: false },
);

export const ExamSchema = new Schema<ExamRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    instructions: { type: String, required: true },
    status: {
      type: String,
      enum: ['draft', 'published', 'cancelled', 'archived'],
      required: true,
      default: 'draft',
    },
    allowedProgramIds: { type: [Schema.Types.ObjectId], ref: 'Program', required: true },
    startAt: { type: Date, required: true },
    endEntryAt: { type: Date, required: true },
    durationSeconds: { type: Number, required: true },
    timezone: { type: String, required: true },
    passwordHash: { type: String, select: false },
    lockdownRequired: { type: Boolean, required: true },
    allowStandardBrowserFallback: { type: Boolean, required: true },
    sebConfigKeys: { type: [String], required: true, select: false },
    sebConfigurationUrl: String,
    showQuestionReview: { type: Boolean, required: true },
    showCorrectAnswers: { type: Boolean, required: true },
    gradeBoundaries: { type: [GradeBoundarySchema], required: true },
    sections: { type: [DraftSectionSchema], required: true },
    currentVersion: { type: Number, required: true, default: 1 },
    publishedVersionId: { type: Schema.Types.ObjectId, ref: 'ExamVersion' },
    publishedAt: Date,
    cancelledAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  safeOptions,
);
ExamSchema.index({ publicId: 1 }, { unique: true, name: 'uq_exam_public_id' });
ExamSchema.index({ status: 1, startAt: 1 }, { name: 'ix_exam_schedule' });
ExamSchema.index(
  { allowedProgramIds: 1, status: 1, startAt: 1 },
  { name: 'ix_exam_program_schedule' },
);

export const ExamVersionSchema = new Schema<ExamVersionRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    examPublicId: { type: String, required: true, immutable: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, immutable: true },
    versionNumber: { type: Number, required: true, immutable: true },
    name: { type: String, required: true, immutable: true },
    description: { type: String, required: true, immutable: true },
    instructions: { type: String, required: true, immutable: true },
    allowedProgramIds: { type: [Schema.Types.ObjectId], required: true, immutable: true },
    startAt: { type: Date, required: true, immutable: true },
    endEntryAt: { type: Date, required: true, immutable: true },
    durationSeconds: { type: Number, required: true, immutable: true },
    timezone: { type: String, required: true, immutable: true },
    lockdownRequired: { type: Boolean, required: true, immutable: true },
    allowStandardBrowserFallback: { type: Boolean, required: true, immutable: true },
    sebConfigKeys: { type: [String], required: true, immutable: true, select: false },
    sebConfigurationUrl: { type: String, immutable: true },
    showQuestionReview: { type: Boolean, required: true, immutable: true },
    showCorrectAnswers: { type: Boolean, required: true, immutable: true },
    gradeBoundaries: { type: [GradeBoundarySchema], required: true, immutable: true },
    sections: { type: [VersionSectionSchema], required: true, immutable: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  immutableOptions,
);
ExamVersionSchema.index({ publicId: 1 }, { unique: true, name: 'uq_exam_version_public_id' });
ExamVersionSchema.index(
  { examId: 1, versionNumber: 1 },
  { unique: true, name: 'uq_exam_version_number' },
);

export const AttemptSchema = new Schema<AttemptRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    startIdempotencyKey: { type: String, required: true, immutable: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, immutable: true },
    examVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'ExamVersion',
      required: true,
      immutable: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true, immutable: true },
    deviceSessionId: { type: String, required: true, immutable: true },
    status: {
      type: String,
      enum: ['in-progress', 'interrupted', 'submitted', 'auto-submitted', 'terminated'],
      required: true,
    },
    randomSeed: { type: String, required: true, immutable: true, select: false },
    questionInstances: { type: [AttemptQuestionSchema], required: true, immutable: true },
    startedAt: { type: Date, required: true, immutable: true },
    endsAt: { type: Date, required: true },
    currentSectionIndex: { type: Number, required: true, min: 0 },
    sectionStartedAt: { type: Date, required: true },
    sectionEndsAt: { type: Date, required: true },
    lastHeartbeatAt: { type: Date, required: true },
    offlineLeaseExpiresAt: { type: Date, required: true },
    revision: { type: Number, required: true, min: 0 },
    submittedAt: Date,
    submissionIdempotencyKey: String,
    submissionReason: String,
    resumedAt: Date,
    extensionSeconds: { type: Number, required: true, default: 0 },
    suspiciousEventCount: { type: Number, required: true, default: 0 },
  },
  safeOptions,
);
AttemptSchema.index({ publicId: 1 }, { unique: true, name: 'uq_attempt_public_id' });
AttemptSchema.index({ examId: 1, userId: 1 }, { unique: true, name: 'uq_attempt_exam_student' });
AttemptSchema.index(
  { userId: 1, startIdempotencyKey: 1 },
  {
    unique: true,
    name: 'uq_attempt_start_idempotency_v2',
    partialFilterExpression: { startIdempotencyKey: { $type: 'string' } },
  },
);
AttemptSchema.index({ examId: 1, status: 1, updatedAt: -1 }, { name: 'ix_attempt_live' });

export const AnswerSchema = new Schema<AnswerRecord>(
  {
    attemptId: { type: Schema.Types.ObjectId, ref: 'Attempt', required: true, immutable: true },
    questionInstanceId: { type: String, required: true, immutable: true },
    sequence: { type: Number, required: true },
    answer: { type: Schema.Types.Mixed },
    markedForReview: { type: Boolean, required: true },
    clientEventAt: { type: Date, required: true },
    serverReceivedAt: { type: Date, required: true },
    attemptRevision: { type: Number, required: true },
    deviceSessionId: { type: String, required: true },
  },
  safeOptions,
);
AnswerSchema.index(
  { attemptId: 1, questionInstanceId: 1 },
  { unique: true, name: 'uq_answer_instance' },
);
AnswerSchema.index({ attemptId: 1, updatedAt: -1 }, { name: 'ix_answer_attempt' });

export const ResultSchema = new Schema<ResultRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    attemptId: { type: Schema.Types.ObjectId, ref: 'Attempt', required: true, immutable: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, immutable: true },
    examVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'ExamVersion',
      required: true,
      immutable: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    version: { type: Number, required: true, immutable: true },
    score: { type: Number, required: true },
    maximumScore: { type: Number, required: true },
    percentage: { type: Number, required: true },
    grade: { type: String, required: true },
    items: { type: [ResultItemSchema], required: true },
    sectionScores: { type: [SectionScoreSchema], required: true },
    evaluationVersion: { type: String, required: true },
    evaluatedAt: { type: Date, required: true },
    published: { type: Boolean, required: true, default: false },
    publishedAt: Date,
  },
  safeOptions,
);
ResultSchema.index({ publicId: 1 }, { unique: true, name: 'uq_result_public_id' });
ResultSchema.index({ attemptId: 1, version: 1 }, { unique: true, name: 'uq_result_version' });
ResultSchema.index({ examId: 1, published: 1, score: -1 }, { name: 'ix_result_exam' });

export const NotificationSchema = new Schema<NotificationRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    type: {
      type: String,
      enum: [
        'exam-reminder',
        'schedule-change',
        'exam-cancelled',
        'result-published',
        'announcement',
      ],
      required: true,
      immutable: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    email: { type: String, required: true, immutable: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    status: { type: String, enum: ['pending', 'processing', 'sent', 'failed'], required: true },
    attempts: { type: Number, required: true },
    nextAttemptAt: { type: Date, required: true },
    sentAt: Date,
    lastError: String,
    readAt: Date,
  },
  safeOptions,
);
NotificationSchema.index(
  { idempotencyKey: 1 },
  { unique: true, name: 'uq_notification_idempotency' },
);
NotificationSchema.index({ status: 1, nextAttemptAt: 1 }, { name: 'ix_notification_delivery' });
NotificationSchema.index({ userId: 1, createdAt: -1 }, { name: 'ix_notification_inbox' });

export const EXAM_MODELS = {
  exam: 'Exam',
  examVersion: 'ExamVersion',
  attempt: 'Attempt',
  answer: 'Answer',
  result: 'Result',
  notification: 'Notification',
} as const;
