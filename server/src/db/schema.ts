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

export const accountKindEnum = pgEnum('account_kind', ['guest', 'user']);
export const planEnum = pgEnum('plan', ['free', 'pro']);
export const analysisStatusEnum = pgEnum('analysis_status', ['processing', 'completed', 'failed']);
export const analysisSourceEnum = pgEnum('analysis_source', ['manual', 'photo']);
export const idempotencyStatusEnum = pgEnum('idempotency_status', ['in_progress', 'completed']);
export const quotaReasonEnum = pgEnum('quota_reason', ['analysis', 'refund']);
export const billingEventStatusEnum = pgEnum('billing_event_status', ['pending', 'processed']);
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('analyses_account_created_idx').on(table.accountId, table.createdAt, table.id),
    index('analyses_account_status_created_idx').on(table.accountId, table.status, table.createdAt, table.id),
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
  (table) => [index('billing_events_account_created_idx').on(table.accountId, table.createdAt)],
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

export const accountsRelations = relations(accounts, ({ many }) => ({
  analyses: many(analyses),
  analysisReviews: many(analysisReviews),
  refreshTokens: many(refreshTokens),
  otpChallenges: many(otpChallenges),
  quotaEvents: many(quotaEvents),
  idempotencyRecords: many(idempotencyRecords),
  billingEvents: many(billingEvents),
}));

export const analysesRelations = relations(analyses, ({ one, many }) => ({
  account: one(accounts, { fields: [analyses.accountId], references: [accounts.id] }),
  reviews: many(analysisReviews),
}));

export const analysisReviewsRelations = relations(analysisReviews, ({ one }) => ({
  account: one(accounts, { fields: [analysisReviews.accountId], references: [accounts.id] }),
  analysis: one(analyses, { fields: [analysisReviews.analysisId], references: [analyses.id] }),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Analysis = typeof analyses.$inferSelect;
export type AnalysisReview = typeof analysisReviews.$inferSelect;
export type AdminAuditEvent = typeof adminAuditEvents.$inferSelect;
