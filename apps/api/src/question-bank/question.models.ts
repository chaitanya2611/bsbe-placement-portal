import type {
  ChemicalStructure,
  QuestionDifficulty,
  QuestionStatus,
  QuestionType,
} from '@bsbe/contracts';
import { Schema, type HydratedDocument, type Types } from 'mongoose';

export interface MediaAssetRecord {
  publicId: string;
  storageKey: string;
  originalFileName: string;
  contentType: 'image/webp';
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
  status: 'ready' | 'deleted';
  createdBy: Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionRecord {
  publicId: string;
  currentVersionId: Types.ObjectId;
  currentVersionNumber: number;
  type: QuestionType;
  status: QuestionStatus;
  promptSummary: string;
  searchText: string;
  difficulty: QuestionDifficulty;
  tags: string[];
  marks: number;
  negativeMarks: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface VersionOptionRecord {
  id: string;
  text: string;
  mediaId?: Types.ObjectId;
}

export interface NumericalDisplayRecord {
  unit: string;
  decimalPlaces?: number;
}

export interface QuestionVersionRecord {
  publicId: string;
  questionId: Types.ObjectId;
  versionNumber: number;
  type: QuestionType;
  prompt: string;
  options: VersionOptionRecord[];
  marks: number;
  negativeMarks: number;
  difficulty: QuestionDifficulty;
  tags: string[];
  explanation: string;
  mediaIds: Types.ObjectId[];
  chemicalStructure?: ChemicalStructure;
  numerical?: NumericalDisplayRecord;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export interface QuestionRubricRecord {
  questionVersionId: Types.ObjectId;
  keyVersion: string;
  algorithm: 'aes-256-gcm';
  iv: string;
  ciphertext: string;
  authTag: string;
  createdAt: Date;
}

export interface QuestionUsageRecord {
  questionId: Types.ObjectId;
  questionVersionId: Types.ObjectId;
  examPublicId: string;
  examVersionPublicId: string;
  recordedAt: Date;
  createdAt: Date;
}

export type MediaAssetDocument = HydratedDocument<MediaAssetRecord>;
export type QuestionDocument = HydratedDocument<QuestionRecord>;
export type QuestionVersionDocument = HydratedDocument<QuestionVersionRecord>;
export type QuestionRubricDocument = HydratedDocument<QuestionRubricRecord>;
export type QuestionUsageDocument = HydratedDocument<QuestionUsageRecord>;

const safeOptions = { timestamps: true, strict: 'throw' as const, versionKey: false as const };
const immutableOptions = {
  timestamps: { createdAt: true, updatedAt: false },
  strict: 'throw' as const,
  versionKey: false as const,
};

const VersionOptionSchema = new Schema<VersionOptionRecord>(
  {
    id: { type: String, required: true, immutable: true, maxlength: 32 },
    text: { type: String, required: true, immutable: true, maxlength: 2_000 },
    mediaId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', immutable: true },
  },
  { _id: false, strict: 'throw', versionKey: false },
);

const ChemicalStructureSchema = new Schema<ChemicalStructure>(
  {
    format: { type: String, enum: ['smiles', 'molfile'], required: true, immutable: true },
    source: { type: String, required: true, immutable: true, maxlength: 50_000 },
  },
  { _id: false, strict: 'throw', versionKey: false },
);

const NumericalDisplaySchema = new Schema<NumericalDisplayRecord>(
  {
    unit: { type: String, default: '', immutable: true, maxlength: 80 },
    decimalPlaces: { type: Number, min: 0, max: 12, immutable: true },
  },
  { _id: false, strict: 'throw', versionKey: false },
);

export const MediaAssetSchema = new Schema<MediaAssetRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    storageKey: { type: String, required: true, immutable: true, select: false },
    originalFileName: { type: String, required: true, immutable: true, maxlength: 240 },
    contentType: { type: String, enum: ['image/webp'], required: true, immutable: true },
    sizeBytes: { type: Number, required: true, immutable: true, min: 1 },
    width: { type: Number, required: true, immutable: true, min: 1 },
    height: { type: Number, required: true, immutable: true, min: 1 },
    sha256: { type: String, required: true, immutable: true, select: false },
    status: { type: String, enum: ['ready', 'deleted'], required: true, default: 'ready' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    deletedAt: Date,
  },
  safeOptions,
);
MediaAssetSchema.index({ publicId: 1 }, { unique: true, name: 'uq_media_public_id' });
MediaAssetSchema.index({ sha256: 1, status: 1 }, { name: 'ix_media_deduplication' });
MediaAssetSchema.index({ createdAt: -1, status: 1 }, { name: 'ix_media_admin_list' });

export const QuestionSchema = new Schema<QuestionRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    currentVersionId: { type: Schema.Types.ObjectId, ref: 'QuestionVersion', required: true },
    currentVersionNumber: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      enum: ['single-choice', 'multiple-select', 'true-false', 'numerical'],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'archived'],
      required: true,
      default: 'draft',
    },
    promptSummary: { type: String, required: true, maxlength: 240 },
    searchText: { type: String, required: true, maxlength: 25_000, select: false },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    tags: { type: [String], required: true },
    marks: { type: Number, required: true, min: 0 },
    negativeMarks: { type: Number, required: true, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  safeOptions,
);
QuestionSchema.index({ publicId: 1 }, { unique: true, name: 'uq_question_public_id' });
QuestionSchema.index(
  { status: 1, type: 1, difficulty: 1, updatedAt: -1 },
  { name: 'ix_question_filters' },
);
QuestionSchema.index({ tags: 1, status: 1 }, { name: 'ix_question_tags' });
QuestionSchema.index({ searchText: 'text' }, { name: 'tx_question_search' });

export const QuestionVersionSchema = new Schema<QuestionVersionRecord>(
  {
    publicId: { type: String, required: true, immutable: true },
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true, immutable: true },
    versionNumber: { type: Number, required: true, immutable: true, min: 1 },
    type: {
      type: String,
      enum: ['single-choice', 'multiple-select', 'true-false', 'numerical'],
      required: true,
      immutable: true,
    },
    prompt: { type: String, required: true, immutable: true, maxlength: 20_000 },
    options: { type: [VersionOptionSchema], required: true, immutable: true },
    marks: { type: Number, required: true, immutable: true, min: 0 },
    negativeMarks: { type: Number, required: true, immutable: true, min: 0 },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      required: true,
      immutable: true,
    },
    tags: { type: [String], required: true, immutable: true },
    explanation: { type: String, required: true, immutable: true, maxlength: 20_000 },
    mediaIds: { type: [Schema.Types.ObjectId], ref: 'MediaAsset', required: true, immutable: true },
    chemicalStructure: { type: ChemicalStructureSchema, immutable: true },
    numerical: { type: NumericalDisplaySchema, immutable: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  immutableOptions,
);
QuestionVersionSchema.index(
  { publicId: 1 },
  { unique: true, name: 'uq_question_version_public_id' },
);
QuestionVersionSchema.index(
  { questionId: 1, versionNumber: 1 },
  { unique: true, name: 'uq_question_version_number' },
);

export const QuestionRubricSchema = new Schema<QuestionRubricRecord>(
  {
    questionVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'QuestionVersion',
      required: true,
      immutable: true,
    },
    keyVersion: { type: String, required: true, immutable: true, maxlength: 40 },
    algorithm: { type: String, enum: ['aes-256-gcm'], required: true, immutable: true },
    iv: { type: String, required: true, immutable: true, select: false },
    ciphertext: { type: String, required: true, immutable: true, select: false },
    authTag: { type: String, required: true, immutable: true, select: false },
  },
  immutableOptions,
);
QuestionRubricSchema.index(
  { questionVersionId: 1 },
  { unique: true, name: 'uq_question_version_rubric' },
);

export const QuestionUsageSchema = new Schema<QuestionUsageRecord>(
  {
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true, immutable: true },
    questionVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'QuestionVersion',
      required: true,
      immutable: true,
    },
    examPublicId: { type: String, required: true, immutable: true },
    examVersionPublicId: { type: String, required: true, immutable: true },
    recordedAt: { type: Date, required: true, immutable: true },
  },
  immutableOptions,
);
QuestionUsageSchema.index({ questionId: 1, recordedAt: -1 }, { name: 'ix_question_usage_history' });
QuestionUsageSchema.index(
  { questionVersionId: 1, examVersionPublicId: 1 },
  { unique: true, name: 'uq_question_exam_version_usage' },
);

export const QUESTION_MODELS = {
  mediaAsset: 'MediaAsset',
  question: 'Question',
  questionRubric: 'QuestionRubric',
  questionUsage: 'QuestionUsage',
  questionVersion: 'QuestionVersion',
} as const;
