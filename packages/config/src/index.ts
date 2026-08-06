import { z } from 'zod';

const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T): z.ZodPreprocess<T> =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema,
  );

const falseBooleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const trueBooleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const productionSecret = (name: string): z.ZodDefault<z.ZodString> =>
  z
    .string()
    .min(32, `${name} must contain at least 32 characters`)
    .default(`development-only-${name.toLowerCase()}-change-me`);

const rubricKeyRing = z
  .string()
  .default('{"development-v1":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc="}')
  .transform((value, context): Record<string, string> => {
    try {
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      const entries = Object.entries(parsed);
      if (
        entries.length === 0 ||
        entries.some(
          ([version, key]) =>
            !/^[A-Za-z0-9._-]{1,40}$/.test(version) ||
            typeof key !== 'string' ||
            !/^[A-Za-z0-9+/]{43}=$/.test(key),
        )
      ) {
        throw new Error();
      }
      return Object.fromEntries(entries);
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'QUESTION_RUBRIC_KEYS_JSON must map key versions to 32-byte base64 keys',
      });
      return z.NEVER;
    }
  });

const commaSeparatedOrigins = z
  .string()
  .min(1)
  .default('http://localhost:5173')
  .transform((value, context) => {
    const origins = value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (origins.some((origin) => origin === '*')) {
      context.addIssue({
        code: 'custom',
        message: 'Wildcard CORS origins are forbidden when credentials are enabled',
      });
      return z.NEVER;
    }

    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
          throw new Error('Origin must not include a path');
        }
      } catch {
        context.addIssue({ code: 'custom', message: `Invalid CORS origin: ${origin}` });
        return z.NEVER;
      }
    }

    return [...new Set(origins)];
  });

export const apiEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    PUBLIC_ORIGIN: z.url().default('http://localhost:5173'),
    CORS_ALLOWED_ORIGINS: commaSeparatedOrigins,
    TRUST_PROXY: falseBooleanString,
    DATABASE_ENABLED: trueBooleanString,
    MONGODB_URI: z
      .string()
      .refine((value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'), {
        message: 'MONGODB_URI must use mongodb:// or mongodb+srv://',
      })
      .default('mongodb://localhost:27017/bsbe_portal?replicaSet=rs0&directConnection=true'),
    OPENAPI_ENABLED: trueBooleanString,
    LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
    INSTITUTE_EMAIL_DOMAIN: z.string().min(1).default('replace-with-real-domain'),
    DISPLAY_TIMEZONE: z.string().min(1).default('Asia/Kolkata'),
    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    SMTP_SECURE: falseBooleanString,
    SMTP_FROM: z.string().min(1).default('BSBE Portal <no-reply@replace-with-real-domain>'),
    SMTP_USER: emptyStringToUndefined(z.string().min(1).optional()),
    SMTP_PASSWORD: emptyStringToUndefined(z.string().min(1).optional()),
    MAILPIT_UI_URL: z.url().default('http://localhost:8025'),
    OBJECT_STORAGE_PROVIDER: z.string().min(1).default('<object-storage-provider>'),
    OTP_PEPPER: productionSecret('OTP_PEPPER'),
    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    OTP_MAX_VERIFY_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    OTP_LOCKOUT_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    OTP_REQUEST_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
    OTP_RATE_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    OTP_MAX_REQUESTS_PER_EMAIL: z.coerce.number().int().min(1).max(20).default(5),
    OTP_MAX_REQUESTS_PER_IP: z.coerce.number().int().min(1).max(100).default(20),
    SESSION_TOKEN_PEPPER: productionSecret('SESSION_TOKEN_PEPPER'),
    SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('bsbe_session'),
    SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(3600),
    SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().min(900).max(2_592_000).default(43_200),
    STUDENT_CONCURRENT_LOGIN_POLICY: z.enum(['replace', 'reject']).default('replace'),
    RECENT_AUTH_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
    CSRF_SECRET: productionSecret('CSRF_SECRET'),
    CSRF_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('bsbe_csrf'),
    IP_HASH_KEY: productionSecret('IP_HASH_KEY'),
    QUESTION_RUBRIC_KEYS_JSON: rubricKeyRing,
    QUESTION_RUBRIC_ACTIVE_KEY_VERSION: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,40}$/)
      .default('development-v1'),
    MEDIA_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    MEDIA_LOCAL_ROOT: z
      .string()
      .regex(/^(?![A-Za-z]:)(?![/\\])(?!.*(?:^|[/\\])\.\.(?:[/\\]|$)).+$/)
      .default('var/media'),
    MEDIA_MAX_BYTES: z.coerce.number().int().min(1024).max(10_485_760).default(5_242_880),
    MEDIA_MAX_PIXELS: z.coerce.number().int().min(1_000_000).max(40_000_000).default(25_000_000),
    S3_ENDPOINT: emptyStringToUndefined(z.url().optional()),
    S3_REGION: z.string().min(1).default('auto'),
    S3_BUCKET: emptyStringToUndefined(z.string().min(3).max(255).optional()),
    S3_ACCESS_KEY_ID: emptyStringToUndefined(z.string().min(1).optional()),
    S3_SECRET_ACCESS_KEY: emptyStringToUndefined(z.string().min(1).optional()),
    S3_FORCE_PATH_STYLE: trueBooleanString,
    S3_SERVER_SIDE_ENCRYPTION: emptyStringToUndefined(z.literal('AES256').optional()),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      environment.INSTITUTE_EMAIL_DOMAIN === 'replace-with-real-domain'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['INSTITUTE_EMAIL_DOMAIN'],
        message: 'Production requires the real institute email domain',
      });
    }

    if (environment.SESSION_IDLE_TTL_SECONDS > environment.SESSION_ABSOLUTE_TTL_SECONDS) {
      context.addIssue({
        code: 'custom',
        path: ['SESSION_IDLE_TTL_SECONDS'],
        message: 'Idle session lifetime cannot exceed the absolute session lifetime',
      });
    }

    if (environment.NODE_ENV === 'production') {
      for (const key of [
        'OTP_PEPPER',
        'SESSION_TOKEN_PEPPER',
        'CSRF_SECRET',
        'IP_HASH_KEY',
      ] as const) {
        if (environment[key].startsWith('development-only-')) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `Production requires a non-development ${key}`,
          });
        }
      }
      if (environment.MEDIA_STORAGE_DRIVER === 'local') {
        context.addIssue({
          code: 'custom',
          path: ['MEDIA_STORAGE_DRIVER'],
          message: 'Production requires S3-compatible durable media storage',
        });
      }
      if (environment.QUESTION_RUBRIC_ACTIVE_KEY_VERSION.startsWith('development-')) {
        context.addIssue({
          code: 'custom',
          path: ['QUESTION_RUBRIC_ACTIVE_KEY_VERSION'],
          message: 'Production requires a non-development rubric key version',
        });
      }
    }

    if (
      !(environment.QUESTION_RUBRIC_ACTIVE_KEY_VERSION in environment.QUESTION_RUBRIC_KEYS_JSON)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['QUESTION_RUBRIC_ACTIVE_KEY_VERSION'],
        message: 'Active rubric key version is absent from QUESTION_RUBRIC_KEYS_JSON',
      });
    }
    if (environment.MEDIA_STORAGE_DRIVER === 's3' && !environment.S3_BUCKET) {
      context.addIssue({
        code: 'custom',
        path: ['S3_BUCKET'],
        message: 'S3_BUCKET is required for S3 media storage',
      });
    }
    if (Boolean(environment.S3_ACCESS_KEY_ID) !== Boolean(environment.S3_SECRET_ACCESS_KEY)) {
      context.addIssue({
        code: 'custom',
        path: ['S3_ACCESS_KEY_ID'],
        message: 'S3 access key ID and secret must be configured together',
      });
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export function parseApiEnvironment(input: Record<string, unknown>): ApiEnvironment {
  return apiEnvironmentSchema.parse(input);
}

export const webEnvironmentSchema = z.object({
  VITE_APP_NAME: z.string().min(1).default('BSBE Placement Mock Test Portal'),
  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
});

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;

export function parseWebEnvironment(input: Record<string, unknown>): WebEnvironment {
  return webEnvironmentSchema.parse(input);
}
