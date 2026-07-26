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

export const accountsRelations = relations(accounts, ({ many }) => ({
  analyses: many(analyses),
  refreshTokens: many(refreshTokens),
  quotaEvents: many(quotaEvents),
  idempotencyRecords: many(idempotencyRecords),
  billingEvents: many(billingEvents),
}));

export const analysesRelations = relations(analyses, ({ one }) => ({
  account: one(accounts, { fields: [analyses.accountId], references: [accounts.id] }),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Analysis = typeof analyses.$inferSelect;
