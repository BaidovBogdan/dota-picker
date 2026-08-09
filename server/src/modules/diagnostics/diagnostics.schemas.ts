import { z } from 'zod';

export const diagnosticsRetentionDays = 30;
export const diagnosticsConsentVersion = 1;
export const diagnosticsBatchLimit = 20;
export const diagnosticsBodyLimitBytes = 128 * 1024;

export const diagnosticModeSchema = z.enum(['vision', 'overwolf']);
export const diagnosticSessionStatusSchema = z.enum(['active', 'completed', 'error']);
export const diagnosticEventStatusSchema = z.enum(['info', 'success', 'warning', 'error']);
export const diagnosticEventTypeSchema = z.enum([
  'app_started',
  'mode_changed',
  'draft_started',
  'capture_decision',
  'request_started',
  'request_completed',
  'recognition_result',
  'overlay_state',
  'engine_error',
  'draft_ended',
  'app_stopped',
]);
export const diagnosticStageSchema = z.enum([
  'app',
  'draft',
  'capture',
  'request',
  'recognition',
  'overlay',
  'engine',
]);

const eventBase = {
  id: z.uuid(),
  sequence: z.number().int().min(1).max(100_000),
  createdAt: z.iso.datetime(),
  durationMs: z.number().int().min(0).max(120_000).nullable().default(null),
};

const waitingReasonSchema = z.enum([
  'not_dota_draft',
  'image_unclear',
  'uncertain_picks',
  'insufficient_enemy_picks',
  'no_enemy_picks',
]);

const recognitionSlotSchema = z.object({
  slot: z.number().int().min(0).max(4),
  side: z.enum(['ally', 'enemy', 'unknown']),
  visualGroup: z.enum(['left', 'right']).nullable(),
  heroId: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  needsReview: z.boolean(),
}).strict();

export const diagnosticEventInputSchema = z.discriminatedUnion('type', [
  z.object({
    ...eventBase,
    type: z.literal('app_started'),
    status: z.literal('info'),
    stage: z.literal('app'),
    details: z.object({
      consentVersion: z.literal(diagnosticsConsentVersion),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('mode_changed'),
    status: z.literal('info'),
    stage: z.literal('app'),
    details: z.object({ mode: diagnosticModeSchema }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('draft_started'),
    status: z.literal('info'),
    stage: z.literal('draft'),
    details: z.object({ draftSessionId: z.uuid() }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('capture_decision'),
    status: z.enum(['info', 'warning']),
    stage: z.literal('capture'),
    details: z.object({
      revision: z.number().int().nonnegative().max(10_000),
      distance: z.number().int().nonnegative().max(10_000).nullable(),
      decision: z.enum(['no_window', 'unchanged', 'changed', 'forced', 'retry']),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('request_started'),
    status: z.literal('info'),
    stage: z.literal('request'),
    details: z.object({
      revision: z.number().int().nonnegative().max(10_000),
      operation: z.enum(['create', 'revise']),
      attempt: z.number().int().min(1).max(20),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('request_completed'),
    status: z.enum(['success', 'warning', 'error']),
    stage: z.literal('request'),
    details: z.object({
      revision: z.number().int().nonnegative().max(10_000),
      outcome: z.enum(['waiting', 'completed', 'stale', 'error']),
      waitingReason: waitingReasonSchema.optional(),
      latencyMs: z.number().int().min(0).max(120_000),
      analysisId: z.uuid().optional(),
      recommendationHeroIds: z.array(z.number().int().positive()).max(3).optional(),
      errorCode: z.string().trim().regex(/^[A-Z0-9_]{2,64}$/).optional(),
      recoverable: z.boolean().optional(),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('recognition_result'),
    status: z.enum(['success', 'warning']),
    stage: z.literal('recognition'),
    details: z.object({
      revision: z.number().int().nonnegative().max(10_000),
      quality: z.enum(['clear', 'partial', 'not_dota', 'too_blurry']),
      model: z.string().trim().min(1).max(80).nullable(),
      recognizedCount: z.number().int().min(0).max(10),
      needsReviewCount: z.number().int().min(0).max(10),
      slots: z.array(recognitionSlotSchema).max(10),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('overlay_state'),
    status: z.enum(['info', 'success', 'warning', 'error']),
    stage: z.literal('overlay'),
    details: z.object({
      phase: z.enum([
        'off',
        'starting',
        'waiting_for_dota',
        'watching_draft',
        'recognizing',
        'analyzing',
        'ready',
        'quota',
        'error',
      ]),
      pickCount: z.number().int().min(0).max(10),
      draftActive: z.boolean(),
      visibleSlots: z.array(z.object({
        slot: z.number().int().min(0).max(4),
        side: z.enum(['ally', 'enemy']),
        heroId: z.number().int().positive(),
      }).strict()).max(10),
      orientationRequired: z.boolean(),
      orientationSource: z.enum([
        'gsi_player_hero',
        'manual_confirmation',
        'overwolf',
      ]).nullable(),
      allyGroup: z.enum(['left', 'right']).nullable(),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('engine_error'),
    status: z.literal('error'),
    stage: z.literal('engine'),
    details: z.object({
      code: z.string().trim().regex(/^[A-Z0-9_]{2,64}$/),
      recoverable: z.boolean(),
      stage: diagnosticStageSchema,
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('draft_ended'),
    status: z.enum(['info', 'success', 'error']),
    stage: z.literal('draft'),
    details: z.object({
      reason: z.enum(['completed', 'left_draft', 'assistant_disabled', 'mode_changed', 'error']),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('app_stopped'),
    status: z.enum(['info', 'error']),
    stage: z.literal('app'),
    details: z.object({
      reason: z.enum(['quit', 'update', 'crash', 'rollover', 'mode_changed']),
    }).strict(),
  }).strict(),
]);

export const diagnosticSessionInputSchema = z.object({
  id: z.uuid(),
  platform: z.enum(['win32', 'darwin', 'linux']),
  appVersion: z.string().trim().min(1).max(32),
  appBuild: z.string().trim().min(1).max(64),
  mode: diagnosticModeSchema,
  startedAt: z.iso.datetime(),
  consentVersion: z.literal(diagnosticsConsentVersion),
}).strict();

export const diagnosticBatchInputSchema = z.object({
  session: diagnosticSessionInputSchema,
  events: z.array(diagnosticEventInputSchema).min(1).max(diagnosticsBatchLimit),
}).strict().superRefine((batch, context) => {
  if (new Set(batch.events.map((event) => event.id)).size !== batch.events.length) {
    context.addIssue({ code: 'custom', message: 'Diagnostic event IDs must be unique within a batch' });
  }
  if (new Set(batch.events.map((event) => event.sequence)).size !== batch.events.length) {
    context.addIssue({ code: 'custom', message: 'Diagnostic event sequences must be unique within a batch' });
  }
});

export const diagnosticBatchResponseSchema = z.object({
  accepted: z.number().int().min(0).max(diagnosticsBatchLimit),
  duplicate: z.number().int().min(0).max(diagnosticsBatchLimit),
  retainedUntil: z.iso.datetime(),
});

export const adminDiagnosticsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  q: z.string().trim().max(200).default(''),
  appVersion: z.string().trim().max(32).optional(),
  mode: diagnosticModeSchema.optional(),
  status: diagnosticSessionStatusSchema.optional(),
  hasErrors: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export const adminDiagnosticsDetailQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1_000).default(500),
  beforeSequence: z.coerce.number().int().min(1).max(100_000).optional(),
});

export const diagnosticAdminSessionSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  app: z.object({
    platform: z.enum(['win32', 'darwin', 'linux']),
    version: z.string(),
    build: z.string(),
  }),
  mode: diagnosticModeSchema,
  status: diagnosticSessionStatusSchema,
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  eventCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  lastEventAt: z.iso.datetime(),
});

export const diagnosticAdminEventSchema = z.object({
  id: z.uuid(),
  sequence: z.number().int().positive(),
  type: diagnosticEventTypeSchema,
  status: diagnosticEventStatusSchema,
  stage: diagnosticStageSchema,
  createdAt: z.iso.datetime(),
  durationMs: z.number().int().nonnegative().nullable(),
  error: z.object({
    code: z.string(),
    recoverable: z.boolean(),
  }).optional(),
  details: z.record(z.string(), z.unknown()),
});

export const adminDiagnosticsListResponseSchema = z.object({
  items: z.array(diagnosticAdminSessionSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  summary: z.object({
    sessions: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
  }),
});

export const adminDiagnosticsDetailResponseSchema = z.object({
  session: diagnosticAdminSessionSchema,
  events: z.array(diagnosticAdminEventSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    nextBeforeSequence: z.number().int().positive().nullable(),
  }),
});

export type DiagnosticBatchInput = z.infer<typeof diagnosticBatchInputSchema>;
export type AdminDiagnosticsQuery = z.infer<typeof adminDiagnosticsQuerySchema>;
export type AdminDiagnosticsDetailQuery = z.infer<typeof adminDiagnosticsDetailQuerySchema>;
