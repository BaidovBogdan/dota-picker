import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { ConcurrencyLimiter } from '../../lib/concurrency-limiter.js';
import { AppError, RateLimitError, UnauthorizedError } from '../../lib/errors.js';
import { errorResponseSchema, idempotencyHeadersSchema } from '../../lib/schemas.js';
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
  historyQuerySchema,
  historyResponseSchema,
  overwolfAnalysisResponseSchema,
} from './analysis.schemas.js';
import { AnalysisConsistencyError, type AnalysisService } from './analysis.service.js';
import { createDesktopDraft, resolveDesktopPosition } from './desktop-analysis.js';

type Dependencies = {
  config: Omit<AppConfig, 'recognition'> & {
    recognition?: AppConfig['recognition'];
  };
  analysisService: AnalysisService;
  idempotencyService: IdempotencyService;
  photoAdapter: PhotoRecognizer;
  metaAdapter: OpenDotaAdapter;
  quotaService: QuotaService;
};

const desktopRecognitionBudgetMultiplier = 4;
const mobileDraftSchema = draftSchema.refine(
  draft => draft.source !== 'overwolf',
  { message: 'A mobile analysis must use the manual or photo source' }
);
const overwolfDraftSchema = draftSchema.refine(
  draft => draft.source === 'overwolf',
  { message: 'An Overwolf analysis must use the Overwolf source' }
);
const liveRevisionHeadersSchema = idempotencyHeadersSchema.extend({
  'x-live-session-token': z.string().min(32).max(2048),
});
const liveSessionClaimsSchema = z.object({
  type: z.enum(['overwolf-live-session', 'desktop-live-session']),
  sub: z.uuid(),
  kind: z.enum(['guest', 'user']),
  ver: z.number().int().nonnegative(),
  analysisId: z.uuid(),
  revision: z.number().int().min(0).max(8),
});
const liveSessionTtlMs = 20 * 60 * 1000;
const maximumLiveRevisions = 8;
const maximumDesktopRevisionFrames = 24;

export function analysisRoutes(dependencies: Dependencies): FastifyPluginAsyncZod {
  return async (app) => {
    const recognitionLimiter = new ConcurrencyLimiter(
      dependencies.config.recognition?.concurrency ?? 2,
    );
    const recognize = async (...args: Parameters<typeof recognizeDraftImage>) => {
      const release = recognitionLimiter.tryAcquire();
      if (!release) {
        throw new AppError(
          503,
          'RECOGNITION_BUSY',
          'Image recognition is temporarily at capacity; retry shortly',
        );
      }
      try {
        return await recognizeDraftImage(...args);
      } finally {
        release();
      }
    };
    const desktopUserRateLimit = app.createRateLimit({
      max: 12,
      timeWindow: '1 minute',
      keyGenerator: (request) => `desktop-user:${request.user.sub}`,
    });
    const desktopIpRateLimit = app.createRateLimit({
      max: 48,
      timeWindow: '1 minute',
      keyGenerator: (request) => `desktop-ip:${request.ip}`,
    });
    const enforceDesktopRateLimits = async (
      request: Parameters<typeof desktopUserRateLimit>[0],
    ) => {
      const userLimit = await desktopUserRateLimit(request);
      if (!userLimit.isAllowed && userLimit.isExceeded) {
        throw new RateLimitError(
          'Desktop analysis user rate limit exceeded',
          userLimit.ttlInSeconds,
        );
      }
      const ipLimit = await desktopIpRateLimit(request);
      if (!ipLimit.isAllowed && ipLimit.isExceeded) {
        throw new RateLimitError(
          'Desktop analysis IP rate limit exceeded',
          ipLimit.ttlInSeconds,
        );
      }
    };
    const overwolfUserRateLimit = app.createRateLimit({
      max: 12,
      timeWindow: '1 minute',
      keyGenerator: request => `overwolf-user:${request.user.sub}`,
    });
    const overwolfIpRateLimit = app.createRateLimit({
      max: 48,
      timeWindow: '1 minute',
      keyGenerator: request => `overwolf-ip:${request.ip}`,
    });
    const enforceOverwolfRateLimits = async (
      request: Parameters<typeof overwolfUserRateLimit>[0]
    ) => {
      const userLimit = await overwolfUserRateLimit(request);
      if (!userLimit.isAllowed && userLimit.isExceeded) {
        throw new RateLimitError(
          'Overwolf analysis user rate limit exceeded',
          userLimit.ttlInSeconds
        );
      }
      const ipLimit = await overwolfIpRateLimit(request);
      if (!ipLimit.isAllowed && ipLimit.isExceeded) {
        throw new RateLimitError(
          'Overwolf analysis IP rate limit exceeded',
          ipLimit.ttlInSeconds
        );
      }
    };
    const issueLiveSession = (
      type: 'overwolf-live-session' | 'desktop-live-session',
      accountId: string,
      accountKind: 'guest' | 'user',
      tokenVersion: number,
      analysisId: string,
      revision: number
    ) => {
      const expiresAt = new Date(Date.now() + liveSessionTtlMs);
      return {
        token: app.jwt.sign(
          {
            type,
            sub: accountId,
            kind: accountKind,
            ver: tokenVersion,
            analysisId,
            revision,
          },
          { expiresIn: Math.floor(liveSessionTtlMs / 1000) }
        ),
        revision,
        expiresAt: expiresAt.toISOString(),
      };
    };
    const verifyLiveSession = (
      token: string,
      type: 'overwolf-live-session' | 'desktop-live-session',
      accountId: string,
      accountKind: 'guest' | 'user',
      tokenVersion: number,
      analysisId: string
    ) => {
      try {
        const claims = liveSessionClaimsSchema.parse(app.jwt.verify(token));
        if (
          claims.sub !== accountId
          || claims.type !== type
          || claims.kind !== accountKind
          || claims.ver !== tokenVersion
          || claims.analysisId !== analysisId
        ) {
          throw new Error('Live session scope mismatch');
        }
        return claims;
      } catch {
        throw new UnauthorizedError(
          'TOKEN_INVALID',
          'The live analysis session is invalid or expired'
        );
      }
    };

    app.post('/manual', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Analyses'],
        security: [{ bearerAuth: [] }],
        headers: idempotencyHeadersSchema,
        body: mobileDraftSchema,
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
      return response;
    });

    app.post('/overwolf', {
      preHandler: [app.authenticate, enforceOverwolfRateLimits],
      config: {
        rateLimit: false,
      },
      schema: {
        tags: ['Analyses'],
        security: [{ bearerAuth: [] }],
        headers: idempotencyHeadersSchema,
        body: overwolfDraftSchema,
        response: {
          200: overwolfAnalysisResponseSchema,
          402: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
          429: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }, async (request) => {
      const key = request.headers['idempotency-key'];
      const claim = await dependencies.idempotencyService.claim(
        request.user.sub,
        'analyses.overwolf',
        key,
        request.body
      );
      if (claim.kind === 'completed') {
        return overwolfAnalysisResponseSchema.parse(claim.response);
      }

      let response;
      try {
        response = await dependencies.analysisService.analyze(
          request.user.sub,
          request.body,
          {
            idempotencyRecordId: claim.id,
            leaseToken: claim.leaseToken,
            resourceId: claim.resourceId,
          },
          (analysisResponse) => ({
            ...analysisResponse,
            liveSession: issueLiveSession(
              'overwolf-live-session',
              request.user.sub,
              request.user.kind,
              request.user.ver,
              analysisResponse.analysis.id,
              0,
            ),
          }),
        );
      } catch (error) {
        if (!(error instanceof AnalysisConsistencyError)) {
          await dependencies.idempotencyService.abort(claim.id, claim.leaseToken);
        }
        throw error;
      }
      return response;
    });

    app.put('/overwolf/:id', {
      preHandler: [app.authenticate, enforceOverwolfRateLimits],
      config: {
        rateLimit: false,
      },
      schema: {
        tags: ['Analyses'],
        security: [{ bearerAuth: [] }],
        headers: liveRevisionHeadersSchema,
        params: z.object({ id: z.uuid() }),
        body: overwolfDraftSchema,
        response: {
          200: overwolfAnalysisResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
          429: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }, async (request) => {
      const claims = verifyLiveSession(
        request.headers['x-live-session-token'],
        'overwolf-live-session',
        request.user.sub,
        request.user.kind,
        request.user.ver,
        request.params.id
      );
      if (claims.revision >= maximumLiveRevisions) {
        throw new RateLimitError('Overwolf live revision limit reached', 0);
      }
      const key = request.headers['idempotency-key'];
      const claim = await dependencies.idempotencyService.claim(
        request.user.sub,
        'analyses.overwolf.revision',
        key,
        {
          analysisId: request.params.id,
          revision: claims.revision,
          draft: request.body,
        }
      );
      if (claim.kind === 'completed') {
        return overwolfAnalysisResponseSchema.parse(claim.response);
      }

      let response;
      try {
        response = await dependencies.analysisService.reviseOverwolf(
          request.user.sub,
          request.params.id,
          claims.revision,
          request.body,
          {
            idempotencyRecordId: claim.id,
            leaseToken: claim.leaseToken,
            resourceId: claim.resourceId,
          },
          (revisionResponse) => {
            const { revision, ...analysisResponse } = revisionResponse;
            return {
              ...analysisResponse,
              liveSession: issueLiveSession(
                'overwolf-live-session',
                request.user.sub,
                request.user.kind,
                request.user.ver,
                request.params.id,
                revision,
              ),
            };
          },
        );
      } catch (error) {
        await dependencies.idempotencyService.abort(claim.id, claim.leaseToken);
        throw error;
      }
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
        response = await recognize(
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
        enforceDesktopRateLimits,
      ],
      config: {
        rateLimit: false,
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
          autoPosition: request.query.autoPosition,
          allyGroup: request.query.allyGroup ?? null,
          orientationSource: request.query.orientationSource ?? null,
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
            autoPosition: request.query.autoPosition,
            allyGroup: request.query.allyGroup ?? null,
            orientationSource: request.query.orientationSource ?? null,
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

        const recognition = await recognize(
          upload,
          dependencies.photoAdapter,
          dependencies.metaAdapter,
          {
            detectPosition: request.query.autoPosition,
            ...(request.query.allyGroup
              ? {
                allyGroup: request.query.allyGroup,
                ...(request.query.orientationSource
                  ? { orientationSource: request.query.orientationSource }
                  : {}),
              }
              : {}),
          },
        );
        const decision = createDesktopDraft(
          recognition,
          resolveDesktopPosition(
            recognition,
            request.query.position,
            request.query.autoPosition,
          ),
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
            (analysisResponse) => {
              const analysisPosition = analysisResponse.analysis.input.position;
              const completedRecognition = request.query.autoPosition
                ? {
                    ...recognition,
                    detectedPosition: (
                      analysisPosition !== request.query.position
                      || recognition.detectedPosition === analysisPosition
                    )
                      ? analysisPosition
                      : null,
                  }
                : recognition;
              return {
                status: 'completed' as const,
                revision: request.query.revision,
                frameHash: upload.frameHash,
                recognition: completedRecognition,
                ...analysisResponse,
                liveSession: issueLiveSession(
                  'desktop-live-session',
                  request.user.sub,
                  request.user.kind,
                  request.user.ver,
                  analysisResponse.analysis.id,
                  0,
                ),
              };
            },
            [{
              idempotencyRecordId: frameClaim.id,
              leaseToken: frameClaim.leaseToken,
              resourceId: frameClaim.resourceId,
            }],
          );
          analysisCommitted = true;
          response = analyzed;
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

      if (!analysisCommitted) {
        await dependencies.idempotencyService.complete(
          frameClaim.id,
          frameClaim.leaseToken,
          response,
        );
      }
      return desktopAnalysisResponseSchema.parse(response);
    });

    app.put('/desktop/:id', {
      preHandler: [
        app.authenticate,
        enforceDesktopRateLimits,
      ],
      config: {
        rateLimit: false,
      },
      schema: {
        tags: ['Analyses'],
        consumes: ['multipart/form-data'],
        security: [{ bearerAuth: [] }],
        headers: liveRevisionHeadersSchema,
        params: z.object({ id: z.uuid() }),
        querystring: desktopAnalysisQuerySchema,
        response: {
          200: desktopAnalysisResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          402: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          422: errorResponseSchema,
          429: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }, async (request) => {
      const claims = verifyLiveSession(
        request.headers['x-live-session-token'],
        'desktop-live-session',
        request.user.sub,
        request.user.kind,
        request.user.ver,
        request.params.id,
      );
      const upload = await readDraftImageUpload(
        request,
        dependencies.config.maxImageBytes,
      );
      const key = request.headers['idempotency-key'];
      const frameEndpoint = `analyses.desktop.revision.frame:${request.params.id}`;
      const frameClaim = await dependencies.idempotencyService.claim(
        request.user.sub,
        frameEndpoint,
        key,
        {
          analysisId: request.params.id,
          liveRevision: claims.revision,
          sessionId: request.query.sessionId,
          frameHash: upload.frameHash,
          mimeType: upload.mimeType,
          position: request.query.position,
          autoPosition: request.query.autoPosition,
          allyGroup: request.query.allyGroup ?? null,
          orientationSource: request.query.orientationSource ?? null,
          rank: request.query.rank ?? null,
          revision: request.query.revision,
        },
      );
      if (frameClaim.kind === 'completed') {
        return desktopAnalysisResponseSchema.parse(frameClaim.response);
      }

      const recognitionCount = await dependencies.idempotencyService.countActive(
        request.user.sub,
        frameEndpoint,
      );
      if (recognitionCount > maximumDesktopRevisionFrames) {
        await dependencies.idempotencyService.abort(
          frameClaim.id,
          frameClaim.leaseToken,
        );
        throw new AppError(
          429,
          'RATE_LIMITED',
          'Desktop live frame budget is exhausted',
          { limit: maximumDesktopRevisionFrames },
        );
      }

      let response;
      try {
        const recognition = await recognize(
          upload,
          dependencies.photoAdapter,
          dependencies.metaAdapter,
          {
            detectPosition: request.query.autoPosition,
            ...(request.query.allyGroup
              ? {
                  allyGroup: request.query.allyGroup,
                  ...(request.query.orientationSource
                    ? { orientationSource: request.query.orientationSource }
                    : {}),
                }
              : {}),
          },
        );
        const decision = createDesktopDraft(
          recognition,
          resolveDesktopPosition(
            recognition,
            request.query.position,
            request.query.autoPosition,
          ),
          request.query.rank,
        );
        response = await dependencies.analysisService.reviseDesktop(
          request.user.sub,
          request.params.id,
          claims.revision,
          decision.status === 'ready' ? decision.draft : null,
          {
            idempotencyRecordId: frameClaim.id,
            leaseToken: frameClaim.leaseToken,
            resourceId: frameClaim.resourceId,
          },
          maximumLiveRevisions,
          (revisionResponse) => {
            if (decision.status === 'waiting') {
              return {
                status: 'waiting' as const,
                reason: decision.reason,
                revision: request.query.revision,
                frameHash: upload.frameHash,
                recognition,
                quota: revisionResponse.quota,
              };
            }
            const analysisPosition = revisionResponse.analysis.input.position;
            const completedRecognition = request.query.autoPosition
              ? {
                  ...recognition,
                  detectedPosition: (
                    analysisPosition !== request.query.position
                    || recognition.detectedPosition === analysisPosition
                  )
                    ? analysisPosition
                    : null,
                }
              : recognition;
            return {
              status: 'completed' as const,
              revision: request.query.revision,
              frameHash: upload.frameHash,
              recognition: completedRecognition,
              analysis: revisionResponse.analysis,
              quota: revisionResponse.quota,
              ...(revisionResponse.changed
                ? {
                    liveSession: issueLiveSession(
                      'desktop-live-session',
                      request.user.sub,
                      request.user.kind,
                      request.user.ver,
                      request.params.id,
                      revisionResponse.revision,
                    ),
                  }
                : {}),
            };
          },
        );
      } catch (error) {
        await dependencies.idempotencyService.abort(
          frameClaim.id,
          frameClaim.leaseToken,
        );
        throw error;
      }

      return desktopAnalysisResponseSchema.parse(response);
    });

    app.get('/history', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Analyses'],
        security: [{ bearerAuth: [] }],
        querystring: historyQuerySchema,
        response: { 200: historyResponseSchema },
      },
    }, async (request) => dependencies.analysisService.history(
      request.user.sub,
      request.query.limit,
      request.query.cursor,
      request.query.view,
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
