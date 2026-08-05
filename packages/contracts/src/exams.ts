import { z } from 'zod';
import { safeQuestionVersionSchema } from './questions';

export const examStatusSchema = z.enum(['draft', 'published', 'cancelled', 'archived']);
export const attemptStatusSchema = z.enum([
  'in-progress',
  'interrupted',
  'submitted',
  'auto-submitted',
  'terminated',
]);
export const attendanceStatusSchema = z.enum([
  'not-started',
  'started',
  'in-progress',
  'submitted',
  'auto-submitted',
  'interrupted',
  'resumed',
  'terminated',
  'absent',
]);

export const examSectionInputSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(160),
  instructions: z.string().trim().max(10_000).default(''),
  durationSeconds: z.number().int().min(60).max(21_600),
  questionIds: z.array(z.uuid()).min(1).max(200),
  selectCount: z.number().int().min(1).max(200),
  randomQuestionOrder: z.boolean().default(true),
  randomOptionOrder: z.boolean().default(true),
  navigation: z.enum(['free', 'forward-only']).default('free'),
});

export const gradeBoundarySchema = z.object({
  grade: z.string().trim().min(1).max(12),
  minimumPercentage: z.number().min(0).max(100),
});

export const examInputSchema = z
  .object({
    name: z.string().trim().min(3).max(200),
    description: z.string().trim().max(10_000).default(''),
    instructions: z.string().trim().min(1).max(20_000),
    allowedProgramIds: z.array(z.uuid()).min(1).max(20),
    startAt: z.iso.datetime(),
    endEntryAt: z.iso.datetime(),
    durationSeconds: z.number().int().min(300).max(43_200),
    timezone: z.string().trim().min(1).max(80).default('Asia/Kolkata'),
    password: z.string().min(6).max(128).optional(),
    lockdownRequired: z.boolean().default(false),
    allowStandardBrowserFallback: z.boolean().default(true),
    sebConfigKeys: z
      .array(z.string().regex(/^[a-fA-F0-9]{64}$/))
      .max(12)
      .default([]),
    sebConfigurationUrl: z.string().url().optional(),
    showQuestionReview: z.boolean().default(false),
    showCorrectAnswers: z.boolean().default(false),
    gradeBoundaries: z.array(gradeBoundarySchema).min(1).max(20),
    sections: z.array(examSectionInputSchema).min(1).max(20),
  })
  .superRefine((exam, context) => {
    if (exam.showCorrectAnswers && !exam.showQuestionReview)
      context.addIssue({
        code: 'custom',
        path: ['showCorrectAnswers'],
        message: 'Correct answers require question-wise review to be enabled',
      });
    const grades = exam.gradeBoundaries.map((boundary) => boundary.grade.toLowerCase());
    if (new Set(grades).size !== grades.length)
      context.addIssue({
        code: 'custom',
        path: ['gradeBoundaries'],
        message: 'Grade labels must be unique',
      });
  });

export const examSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  status: examStatusSchema,
  startAt: z.iso.datetime(),
  endEntryAt: z.iso.datetime(),
  durationSeconds: z.number().int().positive(),
  timezone: z.string(),
  lockdownRequired: z.boolean(),
  version: z.number().int().positive(),
  sectionCount: z.number().int().nonnegative(),
  sebConfigurationUrl: z.string().url().optional(),
});

export const studentExamSchema = examSummarySchema.extend({
  instructions: z.string(),
  eligible: z.boolean(),
  attemptStatus: attemptStatusSchema.nullable(),
  resultPublished: z.boolean(),
});

export const attemptQuestionSchema = safeQuestionVersionSchema
  .omit({ explanation: true, createdAt: true, questionId: true })
  .extend({ instanceId: z.uuid(), markedForReview: z.boolean().default(false) });

export const attemptViewSchema = z.object({
  id: z.uuid(),
  examId: z.uuid(),
  examName: z.string(),
  status: attemptStatusSchema,
  serverTime: z.iso.datetime(),
  startedAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  offlineLeaseExpiresAt: z.iso.datetime(),
  revision: z.number().int().nonnegative(),
  currentSectionIndex: z.number().int().nonnegative(),
  sectionCount: z.number().int().positive(),
  sectionEndsAt: z.iso.datetime(),
  section: z.object({
    id: z.uuid(),
    title: z.string(),
    instructions: z.string(),
    navigation: z.enum(['free', 'forward-only']),
  }),
  questions: z.array(attemptQuestionSchema),
  answers: z.record(z.string(), z.unknown()),
  saveSequences: z.record(z.string(), z.number().int().nonnegative()),
});

export const saveAnswerSchema = z.object({
  questionInstanceId: z.uuid(),
  sequence: z.number().int().positive(),
  attemptRevision: z.number().int().nonnegative(),
  clientEventAt: z.iso.datetime(),
  answer: z.unknown(),
  markedForReview: z.boolean().default(false),
});

export const integrityEventSchema = z.object({
  type: z.enum([
    'fullscreen-exit',
    'visibility-hidden',
    'window-blur',
    'copy',
    'paste',
    'print',
    'context-menu',
    'offline',
    'reconnected',
    'lockdown-failure',
  ]),
  occurredAt: z.iso.datetime(),
});

export const resultViewSchema = z.object({
  id: z.uuid(),
  examId: z.uuid(),
  examName: z.string(),
  studentName: z.string(),
  rollNumber: z.string(),
  program: z.string(),
  attendance: attendanceStatusSchema,
  startedAt: z.iso.datetime(),
  submittedAt: z.iso.datetime(),
  score: z.number(),
  maximumScore: z.number(),
  percentage: z.number(),
  grade: z.string(),
  publishedAt: z.iso.datetime(),
  sectionScores: z.array(
    z.object({
      sectionId: z.uuid(),
      title: z.string(),
      score: z.number(),
      maximumScore: z.number(),
    }),
  ),
  questionReview: z
    .array(
      z.object({
        questionId: z.uuid(),
        prompt: z.string(),
        answer: z.unknown(),
        awardedMarks: z.number(),
        maximumMarks: z.number(),
        correct: z.boolean(),
        correctAnswer: z.unknown().optional(),
      }),
    )
    .optional(),
});

export type AttemptStatus = z.infer<typeof attemptStatusSchema>;
export type AttemptView = z.infer<typeof attemptViewSchema>;
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;
export type ExamInput = z.infer<typeof examInputSchema>;
export type ExamStatus = z.infer<typeof examStatusSchema>;
export type ExamSummary = z.infer<typeof examSummarySchema>;
export type IntegrityEventInput = z.infer<typeof integrityEventSchema>;
export type ResultView = z.infer<typeof resultViewSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
export type StudentExam = z.infer<typeof studentExamSchema>;
