import { relations, sql } from 'drizzle-orm';
import {
  check,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DraftSnapshotHero } from '../modules/heroes/heroes.types.js';

export const accountKindEnum = pgEnum('account_kind', ['guest', 'user']);
export const planEnum = pgEnum('plan', ['free', 'pro']);
export const analysisStatusEnum = pgEnum('analysis_status', ['processing', 'completed', 'failed']);
export const analysisSourceEnum = pgEnum('analysis_source', ['manual', 'photo', 'overwolf']);
export const idempotencyStatusEnum = pgEnum('idempotency_status', ['in_progress', 'completed']);
export const quotaReasonEnum = pgEnum('quota_reason', ['analysis', 'refund']);
export const billingEventStatusEnum = pgEnum('billing_event_status', ['pending', 'processed']);
export const draftSnapshotStatusEnum = pgEnum('draft_snapshot_status', ['building', 'ready', 'failed']);
export const draftPairRelationEnum = pgEnum('draft_pair_relation', ['matchup', 'synergy']);
export const otpPurposeEnum = pgEnum('otp_purpose', [
  'register',
  'login',
  'upgrade_guest',
  'password_reset',
  'password_change',
]);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: accountKindEnum('kind').notNull().default('guest'),
    deviceId: text('device_id'),
    email: text('email'),
    passwordHash: text('password_hash'),
    tokenVersion: integer('token_version').notNull().default(0),
    plan: planEnum('plan').notNull().default('free'),
    complimentaryPro: boolean('complimentary_pro').notNull().default(false),
    planProductId: text('plan_product_id'),
    planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
    billingUpdatedAt: timestamp('billing_updated_at', { withTimezone: true }),
    quotaBalance: integer('quota_balance').notNull(),
    quotaRefreshedAt: timestamp('quota_refreshed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('accounts_device_id_unique').on(table.deviceId),
    uniqueIndex('accounts_email_unique').on(table.email),
    index('accounts_created_idx').on(table.createdAt, table.id),
    check('accounts_identity_check', sql`
      (${table.kind} = 'guest' and ${table.deviceId} is not null and ${table.email} is null and ${table.passwordHash} is null)
      or
      (${table.kind} = 'user' and ${table.email} is not null and ${table.passwordHash} is not null)
    `),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedById: uuid('replaced_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_unique').on(table.tokenHash),
    index('refresh_tokens_account_idx').on(table.accountId),
    index('refresh_tokens_family_idx').on(table.familyId),
  ],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey(),
    purpose: otpPurposeEnum('purpose').notNull(),
    emailHash: text('email_hash').notNull(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    tokenVersion: integer('token_version'),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('otp_challenges_email_purpose_created_idx').on(table.emailHash, table.purpose, table.createdAt),
    index('otp_challenges_account_purpose_created_idx').on(table.accountId, table.purpose, table.createdAt),
    index('otp_challenges_expires_idx').on(table.expiresAt),
    check('otp_challenges_attempts_check', sql`
      ${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.attempts} <= ${table.maxAttempts}
    `),
  ],
);

export const analyses = pgTable(
  'analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    status: analysisStatusEnum('status').notNull().default('processing'),
    source: analysisSourceEnum('source').notNull(),
    input: jsonb('input').$type<Record<string, unknown>>().notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    patch: text('patch'),
    errorCode: text('error_code'),
    revision: integer('revision').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('analyses_account_created_idx').on(table.accountId, table.createdAt, table.id),
    index('analyses_account_status_created_idx').on(table.accountId, table.status, table.createdAt, table.id),
    index('analyses_created_idx').on(table.createdAt, table.id),
  ],
);

export const draftMetaSnapshots = pgTable(
  'draft_meta_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patch: text('patch').notNull(),
    population: text('population').notNull(),
    populationVersion: integer('population_version').notNull().default(1),
    snapshotVersion: integer('snapshot_version').notNull().default(1),
    status: draftSnapshotStatusEnum('status').notNull().default('building'),
    source: text('source').notNull().default('opendota_public_matches_explorer_positions'),
    heroes: jsonb('heroes').$type<DraftSnapshotHero[]>().notNull().default(sql`'[]'::jsonb`),
    matchCount: integer('match_count').notNull().default(0),
    rankMatchCounts: jsonb('rank_match_counts')
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('draft_meta_snapshots_active_unique')
      .on(table.patch, table.population)
      .where(sql`${table.status} = 'building'`),
    index('draft_meta_snapshots_ready_lookup_idx')
      .on(table.patch, table.population, table.status, table.completedAt),
    index('draft_meta_snapshots_expires_idx').on(table.expiresAt),
    check('draft_meta_snapshots_match_count_check', sql`${table.matchCount} >= 0`),
    check(
      'draft_meta_snapshots_population_check',
      sql`${table.population} in ('ranked_all_pick', 'public_all_pick')`,
    ),
    check('draft_meta_snapshots_population_version_check', sql`${table.populationVersion} = 1`),
    check(
      'draft_meta_snapshots_ready_fields_check',
      sql`${table.status} <> 'ready' or (
        ${table.generatedAt} is not null
        and ${table.expiresAt} is not null
        and ${table.completedAt} is not null
        and ${table.expiresAt} >= ${table.generatedAt}
        and jsonb_array_length(${table.heroes}) > 0
      )`,
    ),
    check('draft_meta_snapshots_snapshot_version_check', sql`${table.snapshotVersion} = 1`),
    check(
      'draft_meta_snapshots_source_check',
      sql`${table.source} in (
        'opendota_public_matches_explorer_positions',
        'opendota_public_matches_lane_roles'
      )`,
    ),
    index('draft_meta_snapshots_population_ready_lookup_idx')
      .on(table.population, table.status, table.completedAt),
  ],
);

export const draftPairStats = pgTable(
  'draft_pair_stats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => draftMetaSnapshots.id, { onDelete: 'cascade' }),
    relation: draftPairRelationEnum('relation').notNull(),
    selectedHeroId: integer('selected_hero_id').notNull(),
    candidateHeroId: integer('candidate_hero_id').notNull(),
    rankBucket: integer('rank_bucket').notNull().default(0),
    games: integer('games').notNull(),
    wins: integer('wins').notNull(),
  },
  (table) => [
    uniqueIndex('draft_pair_stats_snapshot_unique')
      .on(
        table.snapshotId,
        table.relation,
        table.selectedHeroId,
        table.candidateHeroId,
        table.rankBucket,
      ),
    index('draft_pair_stats_snapshot_lookup_idx')
      .on(table.snapshotId, table.relation, table.selectedHeroId, table.rankBucket),
    check('draft_pair_stats_hero_check', sql`
      ${table.selectedHeroId} > 0
      and ${table.candidateHeroId} > 0
      and ${table.selectedHeroId} <> ${table.candidateHeroId}
    `),
    check('draft_pair_stats_rank_bucket_check', sql`${table.rankBucket} between 0 and 8`),
    check('draft_pair_stats_games_check', sql`${table.games} > 0 and ${table.wins} between 0 and ${table.games}`),
  ],
);

export const draftPositionStats = pgTable(
  'draft_position_stats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => draftMetaSnapshots.id, { onDelete: 'cascade' }),
    heroId: integer('hero_id').notNull(),
    position: integer('position').notNull(),
    rankBucket: integer('rank_bucket').notNull().default(0),
    games: integer('games').notNull(),
    wins: integer('wins').notNull(),
  },
  (table) => [
    uniqueIndex('draft_position_stats_snapshot_unique')
      .on(table.snapshotId, table.heroId, table.position, table.rankBucket),
    index('draft_position_stats_snapshot_lookup_idx')
      .on(table.snapshotId, table.rankBucket, table.position),
    check('draft_position_stats_hero_check', sql`${table.heroId} > 0`),
    check('draft_position_stats_position_check', sql`${table.position} between 1 and 5`),
    check('draft_position_stats_rank_bucket_check', sql`${table.rankBucket} between 0 and 8`),
    check('draft_position_stats_games_check', sql`${table.games} > 0 and ${table.wins} between 0 and ${table.games}`),
  ],
);

export const analysisReviews = pgTable(
  'analysis_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    selectedHeroIds: jsonb('selected_hero_ids').$type<number[]>().notNull().default(sql`'[]'::jsonb`),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('analysis_reviews_account_analysis_unique').on(table.accountId, table.analysisId),
    index('analysis_reviews_account_updated_idx').on(table.accountId, table.updatedAt, table.id),
    index('analysis_reviews_updated_idx').on(table.updatedAt, table.id),
    index('analysis_reviews_rating_updated_idx').on(table.rating, table.updatedAt, table.id),
    check('analysis_reviews_rating_check', sql`${table.rating} between 1 and 5`),
    check('analysis_reviews_selected_heroes_check', sql`
      jsonb_typeof(${table.selectedHeroIds}) = 'array'
      and jsonb_array_length(${table.selectedHeroIds}) <= 3
    `),
    check('analysis_reviews_comment_check', sql`
      ${table.comment} is null or char_length(${table.comment}) <= 500
    `),
  ],
);

export const quotaEvents = pgTable(
  'quota_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    analysisId: uuid('analysis_id').references(() => analyses.id, { onDelete: 'set null' }),
    delta: integer('delta').notNull(),
    reason: quotaReasonEnum('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('quota_events_account_created_idx').on(table.accountId, table.createdAt),
    uniqueIndex('quota_events_analysis_reason_unique').on(table.analysisId, table.reason),
  ],
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: idempotencyStatusEnum('status').notNull().default('in_progress'),
    response: jsonb('response').$type<Record<string, unknown>>(),
    resourceId: uuid('resource_id'),
    leaseToken: text('lease_token').notNull(),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(1),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idempotency_account_endpoint_key_unique').on(table.accountId, table.endpoint, table.key),
    index('idempotency_expires_idx').on(table.expiresAt),
  ],
);

export const billingEvents = pgTable(
  'billing_events',
  {
    eventId: text('event_id').primaryKey(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: billingEventStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('billing_events_account_created_idx').on(table.accountId, table.createdAt),
    index('billing_events_created_idx').on(table.createdAt, table.eventId),
  ],
);

export const billingTombstones = pgTable(
  'billing_tombstones',
  {
    accountHash: text('account_id').primaryKey(),
    hasEntitlement: boolean('has_entitlement').notNull().default(false),
    planProductId: text('plan_product_id'),
    planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
    quotaBalance: integer('quota_balance'),
    quotaRefreshedAt: timestamp('quota_refreshed_at', { withTimezone: true }),
    billingUpdatedAt: timestamp('billing_updated_at', { withTimezone: true }),
    retainUntil: timestamp('retain_until', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('billing_tombstones_retain_until_idx').on(table.retainUntil)],
);

export const adminAuditEvents = pgTable(
  'admin_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').notNull(),
    marker: text('marker').notNull(),
    actor: text('actor').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('admin_audit_events_marker_unique').on(table.marker),
    index('admin_audit_events_created_idx').on(table.createdAt, table.id),
  ],
);

export const diagnosticSessions = pgTable(
  'diagnostic_sessions',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    appVersion: text('app_version').notNull(),
    appBuild: text('app_build').notNull(),
    mode: text('mode').notNull(),
    status: text('status').notNull().default('active'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull(),
    eventCount: integer('event_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('diagnostic_sessions_account_started_idx').on(table.accountId, table.startedAt, table.id),
    index('diagnostic_sessions_account_created_idx').on(table.accountId, table.createdAt),
    index('diagnostic_sessions_account_last_event_idx').on(table.accountId, table.lastEventAt, table.id),
    index('diagnostic_sessions_mode_last_event_idx').on(table.mode, table.lastEventAt, table.id),
    index('diagnostic_sessions_status_last_event_idx').on(table.status, table.lastEventAt, table.id),
    index('diagnostic_sessions_started_idx').on(table.startedAt, table.id),
    index('diagnostic_sessions_last_event_idx').on(table.lastEventAt, table.id),
    index('diagnostic_sessions_expires_idx').on(table.expiresAt),
    check('diagnostic_sessions_platform_check', sql`${table.platform} in ('win32', 'darwin', 'linux')`),
    check('diagnostic_sessions_mode_check', sql`${table.mode} in ('vision', 'overwolf')`),
    check('diagnostic_sessions_status_check', sql`${table.status} in ('active', 'completed', 'error')`),
    check('diagnostic_sessions_version_check', sql`
      char_length(${table.appVersion}) between 1 and 32
      and char_length(${table.appBuild}) between 1 and 64
    `),
    check('diagnostic_sessions_counts_check', sql`
      ${table.eventCount} >= 0 and ${table.errorCount} >= 0 and ${table.errorCount} <= ${table.eventCount}
    `),
  ],
);

export const diagnosticEvents = pgTable(
  'diagnostic_events',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => diagnosticSessions.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    stage: text('stage').notNull(),
    durationMs: integer('duration_ms'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('diagnostic_events_session_sequence_unique').on(table.sessionId, table.sequence),
    index('diagnostic_events_account_created_idx').on(table.accountId, table.createdAt, table.id),
    index('diagnostic_events_account_received_idx').on(table.accountId, table.receivedAt),
    index('diagnostic_events_session_created_idx').on(table.sessionId, table.createdAt, table.id),
    index('diagnostic_events_expires_idx').on(table.expiresAt),
    check('diagnostic_events_sequence_check', sql`${table.sequence} between 1 and 100000`),
    check('diagnostic_events_status_check', sql`${table.status} in ('info', 'success', 'warning', 'error')`),
    check('diagnostic_events_stage_check', sql`${table.stage} in ('app', 'draft', 'capture', 'request', 'recognition', 'overlay', 'engine')`),
    check('diagnostic_events_duration_check', sql`${table.durationMs} is null or ${table.durationMs} between 0 and 120000`),
    check('diagnostic_events_details_check', sql`jsonb_typeof(${table.details}) = 'object'`),
  ],
);

export const accountsRelations = relations(accounts, ({ many }) => ({
  analyses: many(analyses),
  analysisReviews: many(analysisReviews),
  refreshTokens: many(refreshTokens),
  otpChallenges: many(otpChallenges),
  quotaEvents: many(quotaEvents),
  idempotencyRecords: many(idempotencyRecords),
  billingEvents: many(billingEvents),
  diagnosticSessions: many(diagnosticSessions),
  diagnosticEvents: many(diagnosticEvents),
}));

export const analysesRelations = relations(analyses, ({ one, many }) => ({
  account: one(accounts, { fields: [analyses.accountId], references: [accounts.id] }),
  reviews: many(analysisReviews),
}));

export const analysisReviewsRelations = relations(analysisReviews, ({ one }) => ({
  account: one(accounts, { fields: [analysisReviews.accountId], references: [accounts.id] }),
  analysis: one(analyses, { fields: [analysisReviews.analysisId], references: [analyses.id] }),
}));

export const diagnosticSessionsRelations = relations(diagnosticSessions, ({ one, many }) => ({
  account: one(accounts, { fields: [diagnosticSessions.accountId], references: [accounts.id] }),
  events: many(diagnosticEvents),
}));

export const diagnosticEventsRelations = relations(diagnosticEvents, ({ one }) => ({
  account: one(accounts, { fields: [diagnosticEvents.accountId], references: [accounts.id] }),
  session: one(diagnosticSessions, {
    fields: [diagnosticEvents.sessionId],
    references: [diagnosticSessions.id],
  }),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Analysis = typeof analyses.$inferSelect;
export type AnalysisReview = typeof analysisReviews.$inferSelect;
export type AdminAuditEvent = typeof adminAuditEvents.$inferSelect;
export type DiagnosticSession = typeof diagnosticSessions.$inferSelect;
export type DiagnosticEvent = typeof diagnosticEvents.$inferSelect;
