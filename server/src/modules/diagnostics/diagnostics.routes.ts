import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorResponseSchema } from '../../lib/schemas.js';
import { adminHeadersSchema } from '../admin/admin.schemas.js';
import {
  adminDiagnosticsDetailResponseSchema,
  adminDiagnosticsDetailQuerySchema,
  adminDiagnosticsListResponseSchema,
  adminDiagnosticsQuerySchema,
  diagnosticBatchInputSchema,
  diagnosticBatchResponseSchema,
  diagnosticsBodyLimitBytes,
} from './diagnostics.schemas.js';
import type { DiagnosticsService } from './diagnostics.service.js';

type Dependencies = {
  diagnosticsService: DiagnosticsService;
};

export function diagnosticsRoutes(dependencies: Dependencies): FastifyPluginAsyncZod {
  return async (app) => {
    app.post('/diagnostics/events', {
      bodyLimit: diagnosticsBodyLimitBytes,
      preHandler: [
        app.authenticate,
        app.rateLimit({
          max: 20,
          timeWindow: '1 minute',
          groupId: 'diagnostics-ingestion',
          keyGenerator: (request) => request.user.sub,
        }),
      ],
      config: { rateLimit: false },
      schema: {
        tags: ['Diagnostics'],
        security: [{ bearerAuth: [] }],
        body: diagnosticBatchInputSchema,
        response: {
          200: diagnosticBatchResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          413: errorResponseSchema,
          422: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    }, async (request) => dependencies.diagnosticsService.ingest(
      request.user.sub,
      request.body,
    ));

    app.get('/admin/diagnostics/sessions', {
      preHandler: app.authenticateAdmin,
      schema: {
        tags: ['Admin'],
        security: [{ adminBearerAuth: [] }, { adminApiKey: [] }],
        headers: adminHeadersSchema,
        querystring: adminDiagnosticsQuerySchema,
        response: {
          200: adminDiagnosticsListResponseSchema,
          401: errorResponseSchema,
        },
      },
    }, async (request) => dependencies.diagnosticsService.list(request.query));

    app.get('/admin/diagnostics/sessions/:id', {
      preHandler: app.authenticateAdmin,
      schema: {
        tags: ['Admin'],
        security: [{ adminBearerAuth: [] }, { adminApiKey: [] }],
        headers: adminHeadersSchema,
        params: z.object({ id: z.uuid() }),
        querystring: adminDiagnosticsDetailQuerySchema,
        response: {
          200: adminDiagnosticsDetailResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    }, async (request) => dependencies.diagnosticsService.detail(request.params.id, request.query));
  };
}
