import { z } from 'zod';

export * from './questions';
export * from './exams';

export const healthStatusSchema = z.enum(['ok', 'degraded', 'down']);

export const healthCheckSchema = z.object({
  status: healthStatusSchema,
  checkedAt: z.iso.datetime(),
  service: z.string().min(1),
  version: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  checks: z.record(
    z.string(),
    z.object({
      status: healthStatusSchema,
      detail: z.string().optional(),
    }),
  ),
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1),
  message: z.string().min(1),
  correlationId: z.string().min(1),
  timestamp: z.iso.datetime(),
  path: z.string().startsWith('/'),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const userRoleSchema = z.enum(['student', 'admin']);
export const accountStatusSchema = z.enum(['active', 'inactive']);

export const programSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean(),
});

export const accountSummarySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string().min(1),
  role: userRoleSchema,
  status: accountStatusSchema,
  rollNumber: z.string().nullable(),
  program: programSchema.nullable(),
});

export const sessionSummarySchema = z.object({
  user: accountSummarySchema,
  authenticatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  recentAuthentication: z.boolean(),
});

export const otpRequestResponseSchema = z.object({
  challengeId: z.uuid(),
  expiresInSeconds: z.number().int().positive(),
  message: z.string().min(1),
});

export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type AccountSummary = z.infer<typeof accountSummarySchema>;
export type OtpRequestResponse = z.infer<typeof otpRequestResponseSchema>;
export type Program = z.infer<typeof programSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
