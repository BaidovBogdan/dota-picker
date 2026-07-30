import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { errorResponseSchema, idempotencyHeadersSchema, paginationQuerySchema } from '../../lib/schemas.js';
import type { OpenDotaAdapter } from '../heroes/opendota.adapter.js';
import type { IdempotencyService } from '../idempotency/idempotency.service.js';
import type { PhotoRecognizer } from '../photo/photo-recognizer.js';
import { recognitionResponseSchema } from '../photo/photo.schemas.js';
import {
  readDraftImageUpload,
  recognizeDraftImage,
} from '../photo/photo-upload.js';
import type { QuotaService } from '../quota/quota.service.js';
import { draftSchema } from '../recommendation/recommendation.schemas.js';
import {
  analysisResponseSchema,
  desktopAnalysisQuerySchema,
  desktopAnalysisResponseSchema,
  historyDetailResponseSchema,
  historyResponseSchema,
} from './analysis.schemas.js';
import { AnalysisConsistencyError, type AnalysisService } from './analysis.service.js';
import { createDesktopDraft } from './desktop-analysis.js';

type Dependencies = {
  config: AppConfig;
  analysisService: AnalysisService;
  idempotencyService: IdempotencyService;
  photoAdapter: PhotoRecognizer;
  metaAdapter: OpenDotaAdapter;
  quotaService: QuotaService;
};

const desktopRecognitionBudgetMultiplier = 4;

export function analysisRoutes(dependencies: Dependencies): FastifyPluginAsyncZod {
  return async (app) => {
    app.post('/manual', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Analyses'],
        security: [{ bearerAuth: [] }],
        headers: idempotencyHeadersSchema,
        body: draftSchema,
        response: {
          200: analysisResponseSchema,
          402: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }, async (request) => {
      const key = request.headers['idempotency-key'];
      const claim = await dependencies.idempotencyService.claim(request.user.sub, 'analyses.manual', key, request.body);
      if (claim.kind === 'completed') {
        return analysisResponseSchema.parse(claim.response);
      }

      let response;
      try {
        response = await dependencies.analysisService.analyze(request.user.sub, request.body, {
          idempotencyRecordId: claim.id,
          leaseToken: claim.leaseToken,
          resourceId: claim.resourceId,
        });
      } catch (error) {
        if (!(error instanceof AnalysisConsistencyError)) {
          await dependencies.idempotencyService.abort(claim.id, claim.leaseToken);
        }
        throw error;
      }
      await dependencies.idempotencyService.complete(claim.id, claim.leaseToken, response);
      return response;
    });

    app.post('/photo/recognize', {
      preHandler: [
        app.authenticate,
        app.rateLimit({
          max: 3,
          timeWindow: '1 minute',
          groupId: 'photo-recognition',
          keyGenerator: (request) => request.user.sub,
        }),
      ],
      config: {
        rateLimit: {
          max: 12,
          timeWindow: '1 minute',
          groupId: 'photo-recognition-ip',
        },
      },
      schema: {
        tags: ['Analyses'],
        consumes: ['multipart/form-data'],
        security: [{ bearerAuth: [] }],
        headers: idempotencyHeadersSchema,
        response: {
          200: recognitionResponseSchema,
          400: errorResponseSchema,
          402: errorResponseSchema,
          409: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          422: errorResponseSchema,
          429: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }, async (request) => {
      const upload = await readDraftImageUpload(
        request,
        dependencies.config.maxImageBytes,
      );

      const key = request.headers['idempotency-key'];
      const claim = await dependencies.idempotencyService.claim(
        request.user.sub,
        'analyses.photo.recognize',
        key,
        { imageHash: upload.frameHash, mimeType: upload.mimeType },
      );
      if (claim.kind === 'completed') {
        return recognitionResponseSchema.parse(claim.response);
      }

      const quota = await dependencies.quotaService.get(request.user.sub);
      const recognitionCount = await dependencies.idempotencyService.countActive(
        request.user.sub,
        'analyses.photo.recognize',
      );
      if (quota.remaining <= 0 || recognitionCount > quota.limit) {
        await dependencies.idempotencyService.abort(claim.id, claim.leaseToken);
        throw new AppError(402, 'QUOTA_EXHAUSTED', 'No photo recognition attempts remaining', {
          nextRefillAt: quota.nextRefillAt,
        });
      }

      let response;
      try {
        response = await recognizeDraftImage(
          upload,
          dependencies.photoAdapter,
          dependencies.metaAdapter,
        );
      } catch (error) {
        await dependencies.idempotencyService.abort(claim.id, claim.leaseToken);
        throw error;
      }
      await dependencies.idempotencyService.complete(claim.id, claim.leaseToken, response);
      return response;
    });

    app.post('/desktop', {
      preHandler: [
        app.authenticate,
        app.rateLimit({
          max: 3,
          timeWindow: '1 minute',
          groupId: 'desktop-analysis',
          keyGenerator: (request) => request.user.sub,
        }),
      ],
      config: {
        rateLimit: {
          max: 12,
          timeWindow: '1 minute',
          groupId: 'desktop-analysis-ip',
        },
      },
      schema: {
        tags: ['Analyses'],
        consumes: ['multipart/form-data'],
        security: [{ bearerAuth: [] }],
        headers: idempotencyHeadersSchema,
        querystring: desktopAnalysisQuerySchema,
        response: {
          200: desktopAnalysisResponseSchema,
          400: errorResponseSchema,
          402: errorResponseSchema,
          409: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          422: errorResponseSchema,
          429: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }, async (request) => {
      const upload = await readDraftImageUpload(
        request,
        dependencies.config.maxImageBytes,
      );
      const key = request.headers['idempotency-key'];
      const frameClaim = await dependencies.idempotencyService.claim(
        request.user.sub,
        'analyses.desktop.frame',
        key,
        {
          sessionId: request.query.sessionId,
          frameHash: upload.frameHash,
          mimeType: upload.mimeType,
          position: request.query.position,
          rank: request.query.rank ?? null,
          revision: request.query.revision,
        },
      );
      if (frameClaim.kind === 'completed') {
        return desktopAnalysisResponseSchema.parse(frameClaim.response);
      }

      let sessionClaim:
        | Awaited<ReturnType<IdempotencyService['claim']>>
        | undefined;
      let analysisCommitted = false;
      let response;
      try {
        sessionClaim = await dependencies.idempotencyService.claim(
          request.user.sub,
          'analyses.desktop.session',
          request.query.sessionId,
          {
            sessionId: request.query.sessionId,
            position: request.query.position,
            rank: request.query.rank ?? null,
          },
        );
        if (sessionClaim.kind === 'completed') {
          response = desktopAnalysisResponseSchema.parse(sessionClaim.response);
          await dependencies.idempotencyService.complete(
            frameClaim.id,
            frameClaim.leaseToken,
            response,
          );
          return response;
        }

        const quota = await dependencies.quotaService.get(request.user.sub);
        if (quota.remaining <= 0) {
          throw new AppError(
            402,
            'QUOTA_EXHAUSTED',
            'No desktop analysis attempts remaining',
            { nextRefillAt: quota.nextRefillAt },
          );
        }
        const recognitionCount = await dependencies.idempotencyService.countActive(
          request.user.sub,
          'analyses.desktop.frame',
        );
        const recognitionBudget = Math.max(
          3,
          quota.limit * desktopRecognitionBudgetMultiplier,
        );
        if (recognitionCount > recognitionBudget) {
          throw new AppError(
            429,
            'RATE_LIMITED',
            'Desktop recognition budget is exhausted',
            { limit: recognitionBudget },
          );
        }

        const recognition = await recognizeDraftImage(
          upload,
          dependencies.photoAdapter,
          dependencies.metaAdapter,
        );
        const decision = createDesktopDraft(
          recognition,
          request.query.position,
          request.query.rank,
        );

        if (decision.status === 'waiting') {
          await dependencies.idempotencyService.abort(
            sessionClaim.id,
            sessionClaim.leaseToken,
          );
          response = {
            status: 'waiting' as const,
            reason: decision.reason,
            revision: request.query.revision,
            frameHash: upload.frameHash,
            recognition,
            quota,
          };
        } else {
          const analyzed = await dependencies.analysisService.analyze(
            request.user.sub,
            decision.draft,
            {
              idempotencyRecordId: sessionClaim.id,
              leaseToken: sessionClaim.leaseToken,
              resourceId: sessionClaim.resourceId,
            },
          );
          analysisCommitted = true;
          response = {
            status: 'completed' as const,
            revision: request.query.revision,
            frameHash: upload.frameHash,
            recognition,
            analysis: analyzed.analysis,
            quota: analyzed.quota,
          };
          await dependencies.idempotencyService.complete(
            sessionClaim.id,
            sessionClaim.leaseToken,
            response,
          );
        }
      } catch (error) {
        if (!(error instanceof AnalysisConsistencyError)) {
          if (sessionClaim?.kind === 'acquired' && !analysisCommitted) {
            await dependencies.idempotencyService.abort(
              sessionClaim.id,
              sessionClaim.leaseToken,
            );
          }
          await dependencies.idempotencyService.abort(
            frameClaim.id,
            frameClaim.leaseToken,
          );
        }
        throw error;
      }

      await dependencies.idempotencyService.complete(
        frameClaim.id,
        frameClaim.leaseToken,
        response,
      );
      return desktopAnalysisResponseSchema.parse(response);
    });

    app.get('/history', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Analyses'],
        security: [{ bearerAuth: [] }],
        querystring: paginationQuerySchema,
        response: { 200: historyResponseSchema },
      },
    }, async (request) => dependencies.analysisService.history(
      request.user.sub,
      request.query.limit,
      request.query.cursor,
    ));

    app.get('/history/:id', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Analyses'],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.uuid() }),
        response: { 200: historyDetailResponseSchema, 404: errorResponseSchema },
      },
    }, async (request) => ({ analysis: await dependencies.analysisService.get(request.user.sub, request.params.id) }));
  };
}
