import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  max,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AppConfig } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import {
  accounts,
  adminAuditEvents,
  analyses,
  analysisReviews,
  billingEvents,
} from '../../db/schema.js';
import { complimentaryProGrantId } from '../billing/billing-plan.js';
import type {
  AdminAnalysesQuery,
  AdminUsersQuery,
  OverviewQuery,
} from './admin.schemas.js';

const grantAllMarker = complimentaryProGrantId;

function escapeSearch(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function numeric(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function detailNumber(details: Record<string, unknown>, key: string) {
  return numeric(details[key] as number | string | undefined);
}

type Integration = {
  id: string;
  name: string;
  status: 'connected' | 'connectable' | 'blocked';
  detail: string;
  reason: string | null;
  missing: string[];
};

export class AdminService {
  public constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  public async overview(query: OverviewQuery) {
    const generatedAt = new Date();
    const from = new Date(Date.UTC(
      generatedAt.getUTCFullYear(),
      generatedAt.getUTCMonth(),
      generatedAt.getUTCDate() - query.days + 1,
    ));

    const [
      accountRows,
      analysisRows,
      reviewRows,
      dailyRows,
      recentAccounts,
      recentAnalyses,
      recentBilling,
      recentAudits,
    ] = await Promise.all([
      this.db.select({
        users: count(),
        registered: sql<number>`count(*) filter (where ${accounts.kind} = 'user')::int`,
        guests: sql<number>`count(*) filter (where ${accounts.kind} = 'guest')::int`,
        pro: sql<number>`count(*) filter (where ${accounts.plan} = 'pro')::int`,
      }).from(accounts),
      this.db.select({
        analyses: count(),
        completed: sql<number>`count(*) filter (where ${analyses.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${analyses.status} = 'failed')::int`,
        processing: sql<number>`count(*) filter (where ${analyses.status} = 'processing')::int`,
      }).from(analyses),
      this.db.select({ reviews: count() }).from(analysisReviews),
      this.db.select({
        date: sql<string>`to_char(date_trunc('day', ${analyses.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        analyses: count(),
        activeUsers: countDistinct(analyses.accountId),
        failed: sql<number>`count(*) filter (where ${analyses.status} = 'failed')::int`,
      })
        .from(analyses)
        .where(gte(analyses.createdAt, from))
        .groupBy(sql`date_trunc('day', ${analyses.createdAt} at time zone 'UTC')`),
      this.db.select({
        id: accounts.id,
        email: accounts.email,
        kind: accounts.kind,
        createdAt: accounts.createdAt,
      }).from(accounts).orderBy(desc(accounts.createdAt)).limit(6),
      this.db.select({
        id: analyses.id,
        status: analyses.status,
        source: analyses.source,
        errorCode: analyses.errorCode,
        createdAt: analyses.createdAt,
        accountEmail: accounts.email,
      }).from(analyses)
        .innerJoin(accounts, eq(accounts.id, analyses.accountId))
        .orderBy(desc(analyses.createdAt))
        .limit(12),
      this.db.select({
        id: billingEvents.eventId,
        type: billingEvents.type,
        status: billingEvents.status,
        createdAt: billingEvents.createdAt,
      }).from(billingEvents).orderBy(desc(billingEvents.createdAt)).limit(6),
      this.db.select({
        id: adminAuditEvents.id,
        action: adminAuditEvents.action,
        details: adminAuditEvents.details,
        createdAt: adminAuditEvents.createdAt,
      }).from(adminAuditEvents).orderBy(desc(adminAuditEvents.createdAt)).limit(6),
    ]);

    const dailyByDate = new Map(dailyRows.map((row) => [row.date, row]));
    const daily = Array.from({ length: query.days }, (_, index) => {
      const date = new Date(from.getTime() + index * 24 * 60 * 60 * 1_000)
        .toISOString()
        .slice(0, 10);
      const row = dailyByDate.get(date);
      return {
        date,
        analyses: numeric(row?.analyses),
        activeUsers: numeric(row?.activeUsers),
        failed: numeric(row?.failed),
      };
    });

    const accountActivity = recentAccounts.map((account) => ({
      id: `user:${account.id}`,
      type: 'user' as const,
      title: account.kind === 'user' ? 'Registered account created' : 'Guest account created',
      detail: account.email ?? `Guest ${account.id.slice(0, 8)}`,
      createdAt: account.createdAt.toISOString(),
      tone: 'neutral' as const,
    }));
    const analysisActivity = recentAnalyses.map((analysis) => ({
      id: `analysis:${analysis.id}`,
      type: 'analysis' as const,
      title: analysis.status === 'completed'
        ? 'Analysis completed'
        : analysis.status === 'failed'
          ? 'Analysis failed'
          : 'Analysis started',
      detail: [analysis.source, analysis.accountEmail ?? analysis.id.slice(0, 8), analysis.errorCode]
        .filter(Boolean)
        .join(' · '),
      createdAt: analysis.createdAt.toISOString(),
      tone: analysis.status === 'completed'
        ? 'positive' as const
        : analysis.status === 'failed'
          ? 'negative' as const
          : 'warning' as const,
    }));
    const billingActivity = recentBilling.map((event) => ({
      id: `billing:${event.id}`,
      type: 'billing' as const,
      title: 'RevenueCat webhook received',
      detail: `${event.type} · ${event.status}`,
      createdAt: event.createdAt.toISOString(),
      tone: event.status === 'processed' ? 'positive' as const : 'warning' as const,
    }));
    const auditActivity = recentAudits.map((event) => ({
      id: `system:${event.id}`,
      type: 'system' as const,
      title: 'Admin action completed',
      detail: event.action === 'grant_pro_all'
        ? `Pro granted to ${detailNumber(event.details, 'grantedAccounts')} accounts`
        : event.action,
      createdAt: event.createdAt.toISOString(),
      tone: 'positive' as const,
    }));
    const recentActivity = [
      ...accountActivity,
      ...analysisActivity,
      ...billingActivity,
      ...auditActivity,
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 16);

    const accountTotals = accountRows[0];
    const analysisTotals = analysisRows[0];
    return {
      generatedAt: generatedAt.toISOString(),
      range: {
        days: query.days,
        from: from.toISOString(),
        to: generatedAt.toISOString(),
      },
      totals: {
        users: numeric(accountTotals?.users),
        registered: numeric(accountTotals?.registered),
        guests: numeric(accountTotals?.guests),
        pro: numeric(accountTotals?.pro),
        analyses: numeric(analysisTotals?.analyses),
        completed: numeric(analysisTotals?.completed),
        failed: numeric(analysisTotals?.failed),
        processing: numeric(analysisTotals?.processing),
        reviews: numeric(reviewRows[0]?.reviews),
      },
      daily,
      recentActivity,
    };
  }

  public async listUsers(query: AdminUsersQuery) {
    const conditions: SQL[] = [];
    if (query.kind) conditions.push(eq(accounts.kind, query.kind));
    if (query.plan) conditions.push(eq(accounts.plan, query.plan));
    if (query.q) {
      const pattern = `%${escapeSearch(query.q)}%`;
      const match = or(
        ilike(accounts.email, pattern),
        ilike(accounts.deviceId, pattern),
        sql`${accounts.id}::text ilike ${pattern}`,
      );
      if (match) conditions.push(match);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const analysisStats = this.db.select({
      accountId: analyses.accountId,
      analysesCount: count(analyses.id).as('analyses_count'),
      completedCount: sql<number>`count(*) filter (where ${analyses.status} = 'completed')::int`.as('completed_count'),
      failedCount: sql<number>`count(*) filter (where ${analyses.status} = 'failed')::int`.as('failed_count'),
      processingCount: sql<number>`count(*) filter (where ${analyses.status} = 'processing')::int`.as('processing_count'),
      lastAnalysisAt: max(analyses.updatedAt).as('last_analysis_at'),
    }).from(analyses).groupBy(analyses.accountId).as('admin_analysis_stats');
    const reviewStats = this.db.select({
      accountId: analysisReviews.accountId,
      reviewsCount: count(analysisReviews.id).as('reviews_count'),
    }).from(analysisReviews).groupBy(analysisReviews.accountId).as('admin_review_stats');

    const [totalRows, rows] = await Promise.all([
      this.db.select({ total: count() }).from(accounts).where(where),
      this.db.select({
        account: accounts,
        analysesCount: sql<number>`coalesce(${analysisStats.analysesCount}, 0)::int`,
        completedCount: sql<number>`coalesce(${analysisStats.completedCount}, 0)::int`,
        failedCount: sql<number>`coalesce(${analysisStats.failedCount}, 0)::int`,
        processingCount: sql<number>`coalesce(${analysisStats.processingCount}, 0)::int`,
        reviewsCount: sql<number>`coalesce(${reviewStats.reviewsCount}, 0)::int`,
        lastAnalysisAt: analysisStats.lastAnalysisAt,
      }).from(accounts)
        .leftJoin(analysisStats, eq(analysisStats.accountId, accounts.id))
        .leftJoin(reviewStats, eq(reviewStats.accountId, accounts.id))
        .where(where)
        .orderBy(desc(accounts.createdAt), desc(accounts.id))
        .limit(query.limit)
        .offset(query.offset),
    ]);

    return {
      items: rows.map((row) => {
        const completedCount = numeric(row.completedCount);
        const failedCount = numeric(row.failedCount);
        const terminalCount = completedCount + failedCount;
        return {
          id: row.account.id,
          kind: row.account.kind,
          email: row.account.email,
          deviceId: row.account.deviceId,
          plan: row.account.plan,
          complimentaryPro: row.account.complimentaryPro,
          planProductId: row.account.planProductId,
          planExpiresAt: row.account.planExpiresAt?.toISOString() ?? null,
          quotaBalance: row.account.quotaBalance,
          quotaRefreshedAt: row.account.quotaRefreshedAt.toISOString(),
          billingUpdatedAt: row.account.billingUpdatedAt?.toISOString() ?? null,
          createdAt: row.account.createdAt.toISOString(),
          updatedAt: row.account.updatedAt.toISOString(),
          analysesCount: numeric(row.analysesCount),
          completedCount,
          failedCount,
          processingCount: numeric(row.processingCount),
          reviewsCount: numeric(row.reviewsCount),
          successRate: terminalCount > 0 ? completedCount / terminalCount : null,
          lastAnalysisAt: row.lastAnalysisAt?.toISOString() ?? null,
        };
      }),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: numeric(totalRows[0]?.total),
      },
    };
  }

  public async listAnalyses(query: AdminAnalysesQuery) {
    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(analyses.status, query.status));
    if (query.source) conditions.push(eq(analyses.source, query.source));
    if (query.q) {
      const pattern = `%${escapeSearch(query.q)}%`;
      const match = or(
        ilike(accounts.email, pattern),
        ilike(analyses.patch, pattern),
        ilike(analyses.errorCode, pattern),
        sql`${analyses.id}::text ilike ${pattern}`,
        sql`${analyses.accountId}::text ilike ${pattern}`,
      );
      if (match) conditions.push(match);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalRows, rows] = await Promise.all([
      this.db.select({ total: count() })
        .from(analyses)
        .innerJoin(accounts, eq(accounts.id, analyses.accountId))
        .where(where),
      this.db.select({
        analysis: analyses,
        account: {
          id: accounts.id,
          kind: accounts.kind,
          email: accounts.email,
        },
      }).from(analyses)
        .innerJoin(accounts, eq(accounts.id, analyses.accountId))
        .where(where)
        .orderBy(desc(analyses.createdAt), desc(analyses.id))
        .limit(query.limit)
        .offset(query.offset),
    ]);

    return {
      items: rows.map(({ analysis, account }) => ({
        id: analysis.id,
        accountId: analysis.accountId,
        account,
        status: analysis.status,
        source: analysis.source,
        input: analysis.input,
        result: analysis.result,
        patch: analysis.patch,
        errorCode: analysis.errorCode,
        durationMs: analysis.status === 'processing'
          ? null
          : Math.max(0, analysis.updatedAt.getTime() - analysis.createdAt.getTime()),
        createdAt: analysis.createdAt.toISOString(),
        updatedAt: analysis.updatedAt.toISOString(),
      })),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: numeric(totalRows[0]?.total),
      },
    };
  }

  public async system() {
    const generatedAt = new Date();
    const startedAt = Date.now();
    let databaseStatus: 'connected' | 'blocked' = 'connected';
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      databaseStatus = 'blocked';
    }
    const databaseLatencyMs = Math.max(0, Date.now() - startedAt);
    const integrations: Integration[] = [
      {
        id: 'postgresql',
        name: 'PostgreSQL',
        status: databaseStatus,
        detail: databaseStatus === 'connected'
          ? 'Primary application database is reachable.'
          : 'The configured database did not respond to a health query.',
        reason: databaseStatus === 'connected' ? null : 'Runtime database connection failed.',
        missing: databaseStatus === 'connected' ? [] : ['Reachable DATABASE_URL'],
      },
      {
        id: 'admin-auth',
        name: 'Admin authentication',
        status: this.config.adminApiKey ? 'connected' : 'connectable',
        detail: this.config.adminApiKey
          ? 'Short-lived admin sessions and legacy key authentication are configured.'
          : 'The authentication implementation exists but no admin key is configured.',
        reason: this.config.adminApiKey ? null : 'ADMIN_API_KEY is absent.',
        missing: this.config.adminApiKey ? [] : ['ADMIN_API_KEY'],
      },
      {
        id: 'gemini',
        name: 'Gemini vision and recommendations',
        status: this.config.gemini.apiKey ? 'connected' : 'connectable',
        detail: this.config.gemini.apiKey
          ? 'Gemini models and credentials are configured.'
          : 'The Gemini adapters exist but cannot call the provider without credentials.',
        reason: this.config.gemini.apiKey ? null : 'GEMINI_API_KEY is absent.',
        missing: this.config.gemini.apiKey ? [] : ['GEMINI_API_KEY'],
      },
      {
        id: 'opendota',
        name: 'OpenDota metadata',
        status: 'connected',
        detail: `Metadata adapter is configured for ${this.config.openDota.baseUrl}. Runtime reachability is verified by normal cache refreshes.`,
        reason: null,
        missing: [],
      },
      {
        id: 'revenuecat',
        name: 'RevenueCat webhooks',
        status: this.config.revenueCat.appIds.length > 0 ? 'connected' : 'connectable',
        detail: this.config.revenueCat.appIds.length > 0
          ? 'Webhook verification, entitlement mapping and application allow-list are configured.'
          : 'Webhook verification works, but an application allow-list is not configured.',
        reason: this.config.revenueCat.appIds.length > 0 ? null : 'No RevenueCat application IDs are allow-listed.',
        missing: this.config.revenueCat.appIds.length > 0 ? [] : ['REVENUECAT_APP_IDS'],
      },
      {
        id: 'review-moderation',
        name: 'Review moderation',
        status: 'connected',
        detail: 'Reviews are persisted and protected admin listing and deletion endpoints are available.',
        reason: null,
        missing: [],
      },
      {
        id: 'transactional-email',
        name: 'Transactional email',
        status: 'blocked',
        detail: 'OTP challenge storage exists, but there is no production email delivery adapter.',
        reason: 'Provider integration and delivery code are not implemented.',
        missing: ['Email provider', 'Sender domain', 'Delivery adapter'],
      },
      {
        id: 'screenshot-storage',
        name: 'Draft screenshot storage',
        status: 'blocked',
        detail: 'Draft images are processed in memory and are not retained for the admin console.',
        reason: 'No object storage integration or screenshot reference column exists.',
        missing: ['Object storage', 'Retention policy', 'Screenshot reference schema'],
      },
      {
        id: 'error-monitoring',
        name: 'Error monitoring',
        status: 'blocked',
        detail: 'Structured application logs exist, but no external error monitoring sink is implemented.',
        reason: 'Monitoring SDK and environment configuration are absent.',
        missing: ['Monitoring provider', 'SDK integration', 'Release mapping'],
      },
      {
        id: 'product-analytics',
        name: 'Product analytics',
        status: 'blocked',
        detail: 'Operational database aggregates are available, but product event tracking is not implemented.',
        reason: 'There is no event schema, ingestion adapter or analytics provider.',
        missing: ['Event taxonomy', 'Analytics provider', 'Consent policy'],
      },
    ];
    const groups = {
      connected: integrations.filter((item) => item.status === 'connected'),
      connectable: integrations.filter((item) => item.status === 'connectable'),
      blocked: integrations.filter((item) => item.status === 'blocked'),
    };
    return {
      generatedAt: generatedAt.toISOString(),
      summary: {
        api: { status: 'connected' as const },
        database: { status: databaseStatus, latencyMs: databaseLatencyMs },
        connected: groups.connected.length,
        connectable: groups.connectable.length,
        blocked: groups.blocked.length,
      },
      groups,
    };
  }

  public async grantProToAllFreeAccounts(actor: string) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${grantAllMarker}))`);
      const [existing] = await tx.select().from(adminAuditEvents)
        .where(eq(adminAuditEvents.marker, grantAllMarker))
        .limit(1);
      if (existing) {
        return {
          marker: grantAllMarker,
          alreadyApplied: true,
          totalAccounts: detailNumber(existing.details, 'totalAccounts'),
          eligibleAccounts: detailNumber(existing.details, 'eligibleAccounts'),
          grantedAccounts: detailNumber(existing.details, 'grantedAccounts'),
          quotaBalance: detailNumber(existing.details, 'quotaBalance') || this.config.quota.pro.max,
          appliedAt: existing.createdAt.toISOString(),
        };
      }

      const now = new Date();
      const [totalRow] = await tx.select({ total: count() }).from(accounts);
      const granted = await tx.update(accounts).set({
        plan: 'pro',
        complimentaryPro: true,
        planProductId: grantAllMarker,
        planExpiresAt: null,
        quotaBalance: this.config.quota.pro.max,
        quotaRefreshedAt: now,
        billingUpdatedAt: now,
        updatedAt: now,
      }).where(eq(accounts.plan, 'free')).returning({ id: accounts.id });
      const details = {
        totalAccounts: numeric(totalRow?.total),
        eligibleAccounts: granted.length,
        grantedAccounts: granted.length,
        quotaBalance: this.config.quota.pro.max,
        planExpiresAt: null,
      };
      const [event] = await tx.insert(adminAuditEvents).values({
        action: 'grant_pro_all',
        marker: grantAllMarker,
        actor,
        details,
        createdAt: now,
      }).returning();
      if (!event) {
        throw new Error('Failed to record admin grant audit event');
      }
      return {
        marker: grantAllMarker,
        alreadyApplied: false,
        ...details,
        appliedAt: event.createdAt.toISOString(),
      };
    });
  }
}
