import cors from '@fastify/cors';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { loadConfig, type AppConfig } from './config/env.js';
import { createDatabase } from './db/client.js';
import { accountRoutes } from './modules/account/account.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { AdminService } from './modules/admin/admin.service.js';
import { AnalysisService } from './modules/analysis/analysis.service.js';
import { analysisRoutes } from './modules/analysis/analysis.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { OtpService } from './modules/auth/otp.service.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { BillingService } from './modules/billing/billing.service.js';
import { heroesRoutes } from './modules/heroes/heroes.routes.js';
import {
  PostgresDraftSnapshotRepository,
} from './modules/heroes/draft-snapshot.repository.js';
import { OpenDotaAdapter } from './modules/heroes/opendota.adapter.js';
import { IdempotencyService } from './modules/idempotency/idempotency.service.js';
import { diagnosticsRoutes } from './modules/diagnostics/diagnostics.routes.js';
import { DiagnosticsService } from './modules/diagnostics/diagnostics.service.js';
import { GeminiPhotoAdapter } from './modules/photo/gemini-photo.adapter.js';
import { QuotaService } from './modules/quota/quota.service.js';
import { RecommendationEngine } from './modules/recommendation/recommendation.engine.js';
import { reviewRoutes } from './modules/reviews/review.routes.js';
import { ReviewService } from './modules/reviews/review.service.js';
import { adminStaticPlugin } from './plugins/admin-static.js';
import { adminApiCachePlugin } from './plugins/admin-api-cache.js';
import { authPlugin } from './plugins/auth.js';
import { errorPlugin } from './plugins/errors.js';
import { healthRoutes } from './routes/health.routes.js';

export function buildApp(config: AppConfig = loadConfig()) {
  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: config.maxImageBytes + 1024 * 1024,
    logger: {
      level: config.logLevel,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-admin-key',
        'req.headers.x-live-session-token',
        'req.body.key',
        'res.headers.set-cookie',
      ],
      ...(config.nodeEnv === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
        : {}),
    },
  }).withTypeProvider<ZodTypeProvider>();

  if (config.nodeEnv === 'production' && config.otp.staticCode) {
    app.log.warn('Static OTP verification is enabled in production pre-launch mode');
  }

  const { db, pool, getPoolMetrics } = createDatabase(config.databaseUrl, config.database);
  const quotaService = new QuotaService(db, config.quota);
  const otpService = new OtpService(db, config);
  const authService = new AuthService(db, config, otpService);
  const draftSnapshotRepository = new PostgresDraftSnapshotRepository(db);
  const metaAdapter = new OpenDotaAdapter(
    config.openDota,
    (diagnostic) => {
      if (diagnostic.outcome === 'fallback') {
        app.log.warn(diagnostic, 'OpenDota hero detail refresh used a fallback');
        return;
      }
      app.log.info(diagnostic, 'OpenDota hero detail refresh completed');
    },
    draftSnapshotRepository,
  );
  const recommendationEngine = new RecommendationEngine();
  const analysisService = new AnalysisService(
    db,
    metaAdapter,
    quotaService,
    recommendationEngine,
  );
  const idempotencyService = new IdempotencyService(db, config.idempotencyTtlMs, config.idempotencyLeaseMs);
  const photoAdapter = new GeminiPhotoAdapter(config.gemini, undefined, (diagnostic) => {
    app.log.warn(diagnostic, 'Gemini photo recognition response rejected');
  });
  const billingService = new BillingService(db, config, quotaService);
  const reviewService = new ReviewService(db);
  const diagnosticsService = new DiagnosticsService(db);
  const adminService = new AdminService(db, config, metaAdapter, getPoolMetrics);
  let diagnosticsCleanupRetryTimer: NodeJS.Timeout | null = null;
  const scheduleDiagnosticsCleanup = (delayMs: number): void => {
    if (config.nodeEnv === 'test' || diagnosticsCleanupRetryTimer) return;
    diagnosticsCleanupRetryTimer = setTimeout(() => {
      diagnosticsCleanupRetryTimer = null;
      runDiagnosticsCleanup();
    }, delayMs);
    diagnosticsCleanupRetryTimer.unref();
  };
  const runDiagnosticsCleanup = (): void => {
    void diagnosticsService.pruneExpired()
      .then((backlogRemaining) => {
        if (backlogRemaining) scheduleDiagnosticsCleanup(5_000);
      })
      .catch((error: unknown) => {
        app.log.error({
          err: error,
          code: 'DIAGNOSTIC_RETENTION_CLEANUP_FAILED',
        }, 'Diagnostic retention cleanup failed');
        scheduleDiagnosticsCleanup(60_000);
      });
  };
  const diagnosticsCleanupTimer = config.nodeEnv === 'test'
    ? null
    : setInterval(runDiagnosticsCleanup, 60 * 60 * 1_000);
  diagnosticsCleanupTimer?.unref();
  let idempotencyCleanupRetryTimer: NodeJS.Timeout | null = null;
  const scheduleIdempotencyCleanup = (delayMs: number): void => {
    if (config.nodeEnv === 'test' || idempotencyCleanupRetryTimer) return;
    idempotencyCleanupRetryTimer = setTimeout(() => {
      idempotencyCleanupRetryTimer = null;
      runIdempotencyCleanup();
    }, delayMs);
    idempotencyCleanupRetryTimer.unref();
  };
  const runIdempotencyCleanup = (): void => {
    if (config.nodeEnv === 'test') return;
    void idempotencyService.pruneExpired()
      .then((backlogRemaining) => {
        if (backlogRemaining) scheduleIdempotencyCleanup(5_000);
      })
      .catch((error: unknown) => {
        app.log.error({
          err: error,
          code: 'IDEMPOTENCY_RETENTION_CLEANUP_FAILED',
        }, 'Idempotency retention cleanup failed');
        scheduleIdempotencyCleanup(60_000);
      });
  };
  const idempotencyCleanupTimer = config.nodeEnv === 'test'
    ? null
    : setInterval(runIdempotencyCleanup, 60 * 60 * 1_000);
  idempotencyCleanupTimer?.unref();
  const runDraftSnapshotPrewarm = (): void => {
    if (config.nodeEnv === 'test') return;
    void metaAdapter.prewarmDraftSnapshots().catch((error: unknown) => {
      app.log.warn(
        { err: error, code: 'DRAFT_SNAPSHOT_PREWARM_FAILED' },
        'Draft snapshot prewarm failed',
      );
    });
  };
  const draftSnapshotPrewarmTimer = config.nodeEnv === 'test'
    ? null
    : setInterval(runDraftSnapshotPrewarm, 15 * 60 * 1_000);
  draftSnapshotPrewarmTimer?.unref();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  });
  app.register(helmet, { contentSecurityPolicy: false });
  app.register(compress, { encodings: ['br', 'gzip', 'deflate'], threshold: 1_024 });
  app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.register(multipart, {
    limits: { files: 1, fields: 0, fileSize: config.maxImageBytes },
  });
  app.register(swagger, {
    openapi: {
      info: {
        title: 'Dota Picker API',
        version: '0.1.0',
        description: 'Guest-first Dota 2 draft recommendation API',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          adminBearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          adminApiKey: { type: 'apiKey', in: 'header', name: 'x-admin-key' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  app.register(swaggerUi, { routePrefix: '/docs' });
  app.register(adminApiCachePlugin);
  app.register(authPlugin, { config, db });
  app.register(errorPlugin);
  app.register(healthRoutes(
    db,
    config.nodeEnv === 'test'
      ? undefined
      : () => draftSnapshotRepository.hasReadySnapshot(),
  ), { prefix: '/health' });
  app.register(authRoutes({ config, authService, quotaService }), { prefix: '/v1/auth' });
  app.register(accountRoutes({
    authService,
    quotaService,
    allowQuotaReset: config.nodeEnv !== 'production',
  }), { prefix: '/v1' });
  app.register(heroesRoutes(metaAdapter), { prefix: '/v1/heroes' });
  app.register(analysisRoutes({
    config,
    analysisService,
    idempotencyService,
    photoAdapter,
    metaAdapter,
    quotaService,
  }), { prefix: '/v1/analyses' });
  app.register(billingRoutes({ config, billingService }), { prefix: '/v1/billing' });
  app.register(adminRoutes({ config, adminService }), { prefix: '/v1/admin' });
  app.register(reviewRoutes({ reviewService }), { prefix: '/v1' });
  app.register(diagnosticsRoutes({ diagnosticsService }), { prefix: '/v1' });
  app.register(adminStaticPlugin);

  app.addHook('onListen', async () => {
    runDiagnosticsCleanup();
    runIdempotencyCleanup();
    runDraftSnapshotPrewarm();
  });

  app.addHook('onClose', async () => {
    if (diagnosticsCleanupTimer) clearInterval(diagnosticsCleanupTimer);
    if (diagnosticsCleanupRetryTimer) clearTimeout(diagnosticsCleanupRetryTimer);
    if (idempotencyCleanupTimer) clearInterval(idempotencyCleanupTimer);
    if (idempotencyCleanupRetryTimer) clearTimeout(idempotencyCleanupRetryTimer);
    if (draftSnapshotPrewarmTimer) clearInterval(draftSnapshotPrewarmTimer);
    await pool.end();
  });

  return app;
}
