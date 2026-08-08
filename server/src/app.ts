import cors from '@fastify/cors';
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
import { OpenDotaAdapter } from './modules/heroes/opendota.adapter.js';
import { IdempotencyService } from './modules/idempotency/idempotency.service.js';
import { GeminiPhotoAdapter } from './modules/photo/gemini-photo.adapter.js';
import { QuotaService } from './modules/quota/quota.service.js';
import { RecommendationEngine } from './modules/recommendation/recommendation.engine.js';
import { reviewRoutes } from './modules/reviews/review.routes.js';
import { ReviewService } from './modules/reviews/review.service.js';
import { adminStaticPlugin } from './plugins/admin-static.js';
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

  const { db, pool } = createDatabase(config.databaseUrl);
  const quotaService = new QuotaService(db, config.quota);
  const otpService = new OtpService(db, config);
  const authService = new AuthService(db, config, otpService);
  const metaAdapter = new OpenDotaAdapter(config.openDota);
  const recommendationEngine = new RecommendationEngine();
  const analysisService = new AnalysisService(
    db,
    metaAdapter,
    quotaService,
    recommendationEngine,
  );
  const idempotencyService = new IdempotencyService(db, config.idempotencyTtlMs, config.idempotencyLeaseMs);
  const photoAdapter = new GeminiPhotoAdapter(config.gemini);
  const billingService = new BillingService(db, config, quotaService);
  const reviewService = new ReviewService(db);
  const adminService = new AdminService(db, config, metaAdapter);

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
  app.register(authPlugin, { config, db });
  app.register(errorPlugin);
  app.register(healthRoutes(db), { prefix: '/health' });
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
  app.register(adminStaticPlugin);

  app.addHook('onClose', async () => {
    await pool.end();
  });

  return app;
}
