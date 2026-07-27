import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const databaseUrl = z.url().startsWith('postgresql://');

const optionalDatabaseUrl = z.string().optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  .pipe(databaseUrl.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: databaseUrl,
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().min(2).default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_STATIC_CODE: z.string().optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === '' ? undefined : trimmed;
    })
    .pipe(z.string().regex(/^\d{4}$/).optional()),
  ALLOW_STATIC_OTP_IN_PRODUCTION: booleanFromString,
  OTP_TTL_MINUTES: z.coerce.number().int().min(2).max(30).default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(600).default(60),
  OTP_MAX_REQUESTS_PER_WINDOW: z.coerce.number().int().min(2).max(10).default(5),
  OTP_REQUEST_WINDOW_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8081,http://localhost:19006'),
  ADMIN_API_KEY: z.string().optional().transform((value) => {
    const trimmed = value?.trim();
    return trimmed === '' ? undefined : trimmed;
  }).pipe(z.string().min(32).optional()),
  TRUST_PROXY: booleanFromString,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  FREE_QUOTA_MAX: z.coerce.number().int().positive().default(3),
  FREE_QUOTA_REFILL_AMOUNT: z.coerce.number().int().positive().default(1),
  FREE_QUOTA_REFILL_HOURS: z.coerce.number().positive().default(24),
  PRO_QUOTA_MAX: z.coerce.number().int().positive().default(100),
  PRO_QUOTA_REFILL_AMOUNT: z.coerce.number().int().positive().default(100),
  PRO_QUOTA_REFILL_HOURS: z.coerce.number().positive().default(24),
  OPEN_DOTA_BASE_URL: z.url().default('https://api.opendota.com/api'),
  OPEN_DOTA_TIMEOUT_MS: z.coerce.number().int().min(500).default(8_000),
  META_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  META_CACHE_STALE_SECONDS: z.coerce.number().int().positive().default(86_400),
  GEMINI_API_KEY: z.string().optional().transform((value) => {
    const trimmed = value?.trim();
    return trimmed === '' ? undefined : trimmed;
  }),
  GEMINI_VISION_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_RECOMMENDATION_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
  GEMINI_RECOMMENDATION_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(30_000).default(15_000),
  MAX_IMAGE_BYTES: z.coerce.number().int().min(1_024).max(8 * 1_024 * 1_024).default(5 * 1_024 * 1_024),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().positive().default(24),
  IDEMPOTENCY_LEASE_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
  REVENUECAT_WEBHOOK_SECRET: z.string().min(24),
  REVENUECAT_PRO_ENTITLEMENT_ID: z.string().min(1).default('pro'),
  REVENUECAT_APP_IDS: z.string().default(''),
  REVENUECAT_ALLOW_SANDBOX: booleanFromString,
}).superRefine((env, context) => {
  if (
    env.NODE_ENV === 'production'
    && env.OTP_STATIC_CODE !== undefined
    && !env.ALLOW_STATIC_OTP_IN_PRODUCTION
  ) {
    context.addIssue({
      code: 'custom',
      path: ['OTP_STATIC_CODE'],
      message: 'OTP_STATIC_CODE requires ALLOW_STATIC_OTP_IN_PRODUCTION=true in production',
    });
  }
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadMigrationConfig(source: NodeJS.ProcessEnv = process.env) {
  const env = z.object({
    DATABASE_URL: databaseUrl,
    MIGRATION_DATABASE_URL: optionalDatabaseUrl,
  }).parse(source);

  return {
    databaseUrl: env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL,
  } as const;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const env = envSchema.parse(source);

  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    accessTokenTtl: env.ACCESS_TOKEN_TTL,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    otp: {
      staticCode: env.OTP_STATIC_CODE ?? (env.NODE_ENV === 'production' ? undefined : '1234'),
      ttlMs: env.OTP_TTL_MINUTES * 60 * 1_000,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      resendCooldownMs: env.OTP_RESEND_COOLDOWN_SECONDS * 1_000,
      maxRequestsPerWindow: env.OTP_MAX_REQUESTS_PER_WINDOW,
      requestWindowMs: env.OTP_REQUEST_WINDOW_MINUTES * 60 * 1_000,
    },
    corsOrigins: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
    adminApiKey: env.ADMIN_API_KEY,
    trustProxy: env.TRUST_PROXY,
    logLevel: env.LOG_LEVEL,
    quota: {
      free: {
        max: env.FREE_QUOTA_MAX,
        refillAmount: env.FREE_QUOTA_REFILL_AMOUNT,
        refillEveryMs: env.FREE_QUOTA_REFILL_HOURS * 60 * 60 * 1_000,
      },
      pro: {
        max: env.PRO_QUOTA_MAX,
        refillAmount: env.PRO_QUOTA_REFILL_AMOUNT,
        refillEveryMs: env.PRO_QUOTA_REFILL_HOURS * 60 * 60 * 1_000,
      },
    },
    openDota: {
      baseUrl: env.OPEN_DOTA_BASE_URL.replace(/\/$/, ''),
      timeoutMs: env.OPEN_DOTA_TIMEOUT_MS,
      cacheTtlMs: env.META_CACHE_TTL_SECONDS * 1_000,
      cacheStaleMs: env.META_CACHE_STALE_SECONDS * 1_000,
    },
    gemini: {
      apiKey: env.GEMINI_API_KEY,
      visionModel: env.GEMINI_VISION_MODEL,
      recommendationModel: env.GEMINI_RECOMMENDATION_MODEL,
      timeoutMs: env.GEMINI_TIMEOUT_MS,
      recommendationTimeoutMs: env.GEMINI_RECOMMENDATION_TIMEOUT_MS,
    },
    maxImageBytes: env.MAX_IMAGE_BYTES,
    idempotencyTtlMs: env.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1_000,
    idempotencyLeaseMs: env.IDEMPOTENCY_LEASE_SECONDS * 1_000,
    revenueCat: {
      webhookSecret: env.REVENUECAT_WEBHOOK_SECRET,
      proEntitlementId: env.REVENUECAT_PRO_ENTITLEMENT_ID,
      appIds: env.REVENUECAT_APP_IDS.split(',').map((value) => value.trim()).filter(Boolean),
      allowSandbox: env.REVENUECAT_ALLOW_SANDBOX,
    },
  } as const;
}
