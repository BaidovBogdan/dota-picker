import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  max,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AppConfig } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { ExternalServiceError } from '../../lib/errors.js';
import {
  accounts,
  adminAuditEvents,
  analyses,
  analysisReviews,
  billingEvents,
} from '../../db/schema.js';
import { complimentaryProGrantId } from '../billing/billing-plan.js';
import type { OpenDotaAdapter } from '../heroes/opendota.adapter.js';
import type {
  AdminAnalysesQuery,
  AdminMetaQuery,
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

export function analysisSourceLabel(source: 'manual' | 'photo' | 'overwolf') {
  return {
    manual: 'Вручную',
    photo: 'Фото',
    overwolf: 'Overwolf Live',
  }[source];
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
    private readonly metaAdapter?: Pick<OpenDotaAdapter, 'getHeroes' | 'getMetaPositionSnapshot' | 'getPatch'>,
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
      title: account.kind === 'user' ? 'Создан аккаунт' : 'Создан гостевой профиль',
      detail: account.email ?? `Гость ${account.id.slice(0, 8)}`,
      createdAt: account.createdAt.toISOString(),
      tone: 'neutral' as const,
    }));
    const analysisActivity = recentAnalyses.map((analysis) => ({
      id: `analysis:${analysis.id}`,
      type: 'analysis' as const,
      title: analysis.status === 'completed'
        ? 'Проверка завершена'
        : analysis.status === 'failed'
          ? 'Ошибка проверки'
          : 'Проверка запущена',
      detail: [analysisSourceLabel(analysis.source), analysis.accountEmail ?? analysis.id.slice(0, 8), analysis.errorCode]
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
      title: 'Получен webhook RevenueCat',
      detail: `${event.type} · ${event.status}`,
      createdAt: event.createdAt.toISOString(),
      tone: event.status === 'processed' ? 'positive' as const : 'warning' as const,
    }));
    const auditActivity = recentAudits.map((event) => ({
      id: `system:${event.id}`,
      type: 'system' as const,
      title: 'Действие администратора завершено',
      detail: event.action === 'grant_pro_all'
        ? `Pro выдан ${detailNumber(event.details, 'grantedAccounts')} аккаунтам`
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
    const [totalRows, pageAccounts] = await Promise.all([
      this.db.select({ total: count() }).from(accounts).where(where),
      this.db.select().from(accounts)
        .where(where)
        .orderBy(desc(accounts.createdAt), desc(accounts.id))
        .limit(query.limit)
        .offset(query.offset),
    ]);
    const pageAccountIds = pageAccounts.map((account) => account.id);
    const [analysisRows, reviewRows] = await Promise.all([
      this.db.select({
        accountId: analyses.accountId,
        analysesCount: count(analyses.id),
        completedCount: sql<number>`count(*) filter (where ${analyses.status} = 'completed')::int`,
        failedCount: sql<number>`count(*) filter (where ${analyses.status} = 'failed')::int`,
        processingCount: sql<number>`count(*) filter (where ${analyses.status} = 'processing')::int`,
        lastAnalysisAt: max(analyses.updatedAt),
      }).from(analyses)
        .where(inArray(analyses.accountId, pageAccountIds))
        .groupBy(analyses.accountId),
      this.db.select({
        accountId: analysisReviews.accountId,
        reviewsCount: count(analysisReviews.id),
      }).from(analysisReviews)
        .where(inArray(analysisReviews.accountId, pageAccountIds))
        .groupBy(analysisReviews.accountId),
    ]);
    const analysesByAccount = new Map(analysisRows.map((row) => [row.accountId, row]));
    const reviewsByAccount = new Map(reviewRows.map((row) => [row.accountId, row]));

    return {
      items: pageAccounts.map((account) => {
        const analysisStats = analysesByAccount.get(account.id);
        const reviewStats = reviewsByAccount.get(account.id);
        const completedCount = numeric(analysisStats?.completedCount);
        const failedCount = numeric(analysisStats?.failedCount);
        const terminalCount = completedCount + failedCount;
        return {
          id: account.id,
          kind: account.kind,
          email: account.email,
          deviceId: account.deviceId,
          plan: account.plan,
          complimentaryPro: account.complimentaryPro,
          planProductId: account.planProductId,
          planExpiresAt: account.planExpiresAt?.toISOString() ?? null,
          quotaBalance: account.quotaBalance,
          quotaRefreshedAt: account.quotaRefreshedAt.toISOString(),
          billingUpdatedAt: account.billingUpdatedAt?.toISOString() ?? null,
          createdAt: account.createdAt.toISOString(),
          updatedAt: account.updatedAt.toISOString(),
          analysesCount: numeric(analysisStats?.analysesCount),
          completedCount,
          failedCount,
          processingCount: numeric(analysisStats?.processingCount),
          reviewsCount: numeric(reviewStats?.reviewsCount),
          successRate: terminalCount > 0 ? completedCount / terminalCount : null,
          lastAnalysisAt: analysisStats?.lastAnalysisAt?.toISOString() ?? null,
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

  public async meta(query: AdminMetaQuery) {
    if (!this.metaAdapter) throw new ExternalServiceError('OpenDota metadata is not configured');
    const [heroes, snapshot] = await Promise.all([
      this.metaAdapter.getHeroes(query.rank),
      this.metaAdapter.getMetaPositionSnapshot(query.rank),
    ]);
    return { heroes, ...snapshot };
  }

  public async system() {
    const generatedAt = new Date();
    const databaseStartedAt = Date.now();
    const databasePromise = this.db.execute(sql`select 1`)
      .then(() => ({ status: 'connected' as const, latencyMs: Math.max(0, Date.now() - databaseStartedAt) }))
      .catch(() => ({ status: 'blocked' as const, latencyMs: Math.max(0, Date.now() - databaseStartedAt) }));
    const [databaseProbe, openDotaProbe] = await Promise.all([
      databasePromise,
      this.metaAdapter
        ? this.metaAdapter.getPatch()
          .then((patch) => ({ status: 'fulfilled' as const, patch }))
          .catch(() => ({ status: 'rejected' as const }))
        : Promise.resolve({ status: 'rejected' as const }),
    ]);
    const databaseStatus = databaseProbe.status;
    const databaseLatencyMs = databaseProbe.latencyMs;
    const integrations: Integration[] = [
      {
        id: 'postgresql',
        name: 'PostgreSQL',
        status: databaseStatus,
        detail: databaseStatus === 'connected'
          ? 'Основная база приложения отвечает на запросы.'
          : 'Настроенная база не ответила на проверочный запрос.',
        reason: databaseStatus === 'connected' ? null : 'Не удалось подключиться к базе во время runtime-проверки.',
        missing: databaseStatus === 'connected' ? [] : ['Доступный DATABASE_URL'],
      },
      {
        id: 'admin-auth',
        name: 'Авторизация админки',
        status: this.config.adminApiKey ? 'connected' : 'connectable',
        detail: this.config.adminApiKey
          ? 'Короткие админ-сессии и авторизация по legacy-ключу настроены.'
          : 'Механизм авторизации есть, но ключ администратора не настроен.',
        reason: this.config.adminApiKey ? null : 'Отсутствует ADMIN_API_KEY.',
        missing: this.config.adminApiKey ? [] : ['ADMIN_API_KEY'],
      },
      {
        id: 'gemini',
        name: 'Gemini: распознавание и рекомендации',
        status: this.config.gemini.apiKey ? 'connected' : 'connectable',
        detail: this.config.gemini.apiKey
          ? 'Ключ и модели Gemini настроены; отдельный runtime-запрос из аудита не выполняется.'
          : 'Адаптеры Gemini есть, но без ключа они не могут обратиться к провайдеру.',
        reason: this.config.gemini.apiKey ? null : 'Отсутствует GEMINI_API_KEY.',
        missing: this.config.gemini.apiKey ? [] : ['GEMINI_API_KEY'],
      },
      {
        id: 'opendota',
        name: 'Метаданные OpenDota',
        status: openDotaProbe.status === 'fulfilled' ? 'connected' : 'blocked',
        detail: openDotaProbe.status === 'fulfilled'
          ? `Штатный OpenDota-адаптер вернул метаданные патча ${openDotaProbe.patch}, включая разрешённый кеш.`
          : `Адаптер ${this.config.openDota.baseUrl} не вернул метаданные во время проверки.`,
        reason: openDotaProbe.status === 'fulfilled' ? null : 'Проверка доступности OpenDota завершилась ошибкой.',
        missing: openDotaProbe.status === 'fulfilled' ? [] : ['Доступный OpenDota API'],
      },
      {
        id: 'revenuecat',
        name: 'Webhooks RevenueCat',
        status: this.config.revenueCat.appIds.length > 0 ? 'connected' : 'connectable',
        detail: this.config.revenueCat.appIds.length > 0
          ? 'Проверка webhook, сопоставление подписок и список приложений настроены.'
          : 'Проверка webhook работает, но список разрешённых приложений не настроен.',
        reason: this.config.revenueCat.appIds.length > 0 ? null : 'Нет разрешённых ID приложений RevenueCat.',
        missing: this.config.revenueCat.appIds.length > 0 ? [] : ['REVENUECAT_APP_IDS'],
      },
      {
        id: 'review-moderation',
        name: 'Модерация отзывов',
        status: 'connected',
        detail: 'Отзывы сохраняются; защищённые endpoint списка и удаления доступны администратору.',
        reason: null,
        missing: [],
      },
      {
        id: 'transactional-email',
        name: 'Транзакционные письма',
        status: 'blocked',
        detail: 'Хранилище OTP есть, но адаптер доставки писем не реализован.',
        reason: 'Интеграция с почтовым провайдером и отправка не реализованы.',
        missing: ['Почтовый провайдер', 'Домен отправителя', 'Адаптер доставки'],
      },
      {
        id: 'screenshot-storage',
        name: 'Хранилище скриншотов',
        status: 'blocked',
        detail: 'Скриншоты обрабатываются в памяти и не сохраняются для админки.',
        reason: 'Нет объектного хранилища и поля со ссылкой на скриншот.',
        missing: ['Объектное хранилище', 'Политика хранения', 'Схема ссылки на скриншот'],
      },
      {
        id: 'error-monitoring',
        name: 'Мониторинг ошибок',
        status: 'blocked',
        detail: 'Структурированные логи есть, но внешняя система мониторинга ошибок не подключена.',
        reason: 'Нет SDK мониторинга и конфигурации окружения.',
        missing: ['Провайдер мониторинга', 'SDK-интеграция', 'Сопоставление релизов'],
      },
      {
        id: 'product-analytics',
        name: 'Продуктовая аналитика',
        status: 'blocked',
        detail: 'Агрегаты базы доступны, но отслеживание продуктовых событий не реализовано.',
        reason: 'Нет схемы событий, адаптера приёма и аналитического провайдера.',
        missing: ['Таксономия событий', 'Провайдер аналитики', 'Политика согласий'],
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
