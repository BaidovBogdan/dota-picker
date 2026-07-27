import { createHash } from 'node:crypto';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { errorResponseSchema, idempotencyHeadersSchema, paginationQuerySchema } from '../../lib/schemas.js';
import type { OpenDotaAdapter } from '../heroes/opendota.adapter.js';
import type { IdempotencyService } from '../idempotency/idempotency.service.js';
import type { PhotoRecognizer } from '../photo/photo-recognizer.js';
import { recognitionResponseSchema } from '../photo/photo.schemas.js';
import type { QuotaService } from '../quota/quota.service.js';
import { draftSchema } from '../recommendation/recommendation.schemas.js';
import { analysisResponseSchema, historyDetailResponseSchema, historyResponseSchema } from './analysis.schemas.js';
import { AnalysisConsistencyError, type AnalysisService } from './analysis.service.js';

type Dependencies = {
  config: AppConfig;
  analysisService: AnalysisService;
  idempotencyService: IdempotencyService;
  photoAdapter: PhotoRecognizer;
  metaAdapter: OpenDotaAdapter;
  quotaService: QuotaService;
};

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function hasMatchingSignature(image: Buffer, mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/webp') {
    return image.subarray(0, 4).toString('ascii') === 'RIFF'
      && image.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

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
      const file = await request.file({
        limits: { files: 1, fields: 0, fileSize: dependencies.config.maxImageBytes },
      });
      if (file?.fieldname !== 'image') {
        throw new AppError(400, 'VALIDATION_ERROR', 'Multipart field "image" is required');
      }
      if (!allowedImageTypes.has(file.mimetype)) {
        file.file.resume();
        throw new AppError(415, 'IMAGE_RECOGNITION_FAILED', 'Only JPEG, PNG, or WEBP is supported');
      }
      const image = await file.toBuffer();
      if (image.length === 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Image is empty');
      }
      if (!hasMatchingSignature(image, file.mimetype)) {
        throw new AppError(415, 'IMAGE_RECOGNITION_FAILED', 'Image content does not match its MIME type');
      }

      const key = request.headers['idempotency-key'];
      const imageHash = createHash('sha256').update(image).digest('hex');
      const claim = await dependencies.idempotencyService.claim(
        request.user.sub,
        'analyses.photo.recognize',
        key,
        { imageHash, mimeType: file.mimetype },
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
        const heroes = await dependencies.metaAdapter.getHeroes();
        response = await dependencies.photoAdapter.recognize(image, file.mimetype, heroes);
      } catch (error) {
        await dependencies.idempotencyService.abort(claim.id, claim.leaseToken);
        throw error;
      }
      await dependencies.idempotencyService.complete(claim.id, claim.leaseToken, response);
      return response;
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
