import { z } from 'zod';

export const questionTypeSchema = z.enum([
  'single-choice',
  'multiple-select',
  'true-false',
  'numerical',
]);
export const questionDifficultySchema = z.enum(['easy', 'medium', 'hard']);
export const questionStatusSchema = z.enum(['draft', 'active', 'archived']);

export const questionOptionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/),
  text: z.string().trim().min(1).max(2_000),
  mediaId: z.uuid().optional(),
});

export const chemicalStructureSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('smiles'), source: z.string().trim().min(1).max(2_000) }),
  z.object({ format: z.literal('molfile'), source: z.string().min(1).max(50_000) }),
]);

const commonQuestionFields = {
  prompt: z.string().trim().min(1).max(20_000),
  marks: z.number().finite().positive().max(1_000),
  negativeMarks: z.number().finite().min(0).max(1_000).default(0),
  difficulty: questionDifficultySchema,
  tags: z.array(z.string().trim().min(1).max(48)).max(20).default([]),
  explanation: z.string().trim().max(20_000).default(''),
  mediaIds: z.array(z.uuid()).max(5).default([]),
  chemicalStructure: chemicalStructureSchema.optional(),
};

export const questionDefinitionSchema = z
  .discriminatedUnion('type', [
    z.object({
      ...commonQuestionFields,
      type: z.literal('single-choice'),
      options: z.array(questionOptionSchema).min(2).max(12),
      answer: z.object({ optionId: z.string().min(1).max(32) }),
    }),
    z.object({
      ...commonQuestionFields,
      type: z.literal('multiple-select'),
      options: z.array(questionOptionSchema).min(2).max(12),
      answer: z.object({ optionIds: z.array(z.string().min(1).max(32)).min(1).max(12) }),
    }),
    z.object({
      ...commonQuestionFields,
      type: z.literal('true-false'),
      answer: z.object({ value: z.boolean() }),
    }),
    z.object({
      ...commonQuestionFields,
      type: z.literal('numerical'),
      answer: z.object({
        value: z.number().finite(),
        toleranceMode: z.enum(['exact', 'absolute', 'relative']).default('exact'),
        tolerance: z.number().finite().min(0).default(0),
      }),
      numerical: z.object({
        unit: z.string().trim().max(80).default(''),
        decimalPlaces: z.number().int().min(0).max(12).optional(),
      }),
    }),
  ])
  .superRefine((definition, context) => {
    const tags = definition.tags.map((tag) => tag.toLowerCase());
    if (new Set(tags).size !== tags.length) {
      context.addIssue({ code: 'custom', path: ['tags'], message: 'Tags must be unique' });
    }
    if (definition.negativeMarks > definition.marks) {
      context.addIssue({
        code: 'custom',
        path: ['negativeMarks'],
        message: 'Negative marks cannot exceed positive marks',
      });
    }
    if ('options' in definition) {
      const ids = definition.options.map((option) => option.id);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'Option IDs must be unique',
        });
      }
      const answerIds =
        definition.type === 'single-choice'
          ? [definition.answer.optionId]
          : definition.answer.optionIds;
      if (new Set(answerIds).size !== answerIds.length) {
        context.addIssue({
          code: 'custom',
          path: ['answer'],
          message: 'Answer IDs must be unique',
        });
      }
      for (const answerId of answerIds) {
        if (!ids.includes(answerId)) {
          context.addIssue({
            code: 'custom',
            path: ['answer'],
            message: `Unknown correct option ID: ${answerId}`,
          });
        }
      }
    }
    if (
      definition.type === 'numerical' &&
      definition.answer.toleranceMode === 'exact' &&
      definition.answer.tolerance !== 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['answer', 'tolerance'],
        message: 'Exact numerical answers must use zero tolerance',
      });
    }
  });

export const updateQuestionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  definition: questionDefinitionSchema,
});

export const questionSummarySchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  type: questionTypeSchema,
  status: questionStatusSchema,
  promptSummary: z.string(),
  difficulty: questionDifficultySchema,
  tags: z.array(z.string()),
  marks: z.number(),
  negativeMarks: z.number(),
  updatedAt: z.iso.datetime(),
});

export const safeQuestionVersionSchema = z.object({
  id: z.uuid(),
  questionId: z.uuid(),
  version: z.number().int().positive(),
  type: questionTypeSchema,
  prompt: z.string(),
  options: z.array(questionOptionSchema),
  marks: z.number(),
  negativeMarks: z.number(),
  difficulty: questionDifficultySchema,
  tags: z.array(z.string()),
  explanation: z.string(),
  mediaIds: z.array(z.uuid()),
  chemicalStructure: chemicalStructureSchema.nullable(),
  numerical: z.object({ unit: z.string(), decimalPlaces: z.number().int().nullable() }).nullable(),
  createdAt: z.iso.datetime(),
});

export const mediaAssetSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  contentType: z.literal('image/webp'),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['ready', 'deleted']),
  createdAt: z.iso.datetime(),
});

export type ChemicalStructure = z.infer<typeof chemicalStructureSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type QuestionDefinition = z.infer<typeof questionDefinitionSchema>;
export type QuestionDifficulty = z.infer<typeof questionDifficultySchema>;
export type QuestionStatus = z.infer<typeof questionStatusSchema>;
export type QuestionSummary = z.infer<typeof questionSummarySchema>;
export type QuestionType = z.infer<typeof questionTypeSchema>;
export type SafeQuestionVersion = z.infer<typeof safeQuestionVersionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
