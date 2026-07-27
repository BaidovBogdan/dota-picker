import { and, eq } from 'drizzle-orm';
import type { AppConfig } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { accounts, quotaEvents } from '../../db/schema.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import { materializeQuota, refundOne, reserveOne, type QuotaPolicy } from './quota.logic.js';

export type QuotaView = {
  plan: 'free' | 'pro';
  remaining: number;
  limit: number;
  nextRefillAt: string | null;
  planExpiresAt: string | null;
};

export class QuotaService {
  public constructor(
    private readonly db: Database,
    private readonly policies: AppConfig['quota'],
  ) {}

  public async get(accountId: string, now = new Date()): Promise<QuotaView> {
    return this.db.transaction(async (tx) => {
      const account = await this.lockAccount(tx, accountId);
      const plan = this.effectivePlan(account.plan, account.planExpiresAt, now);
      const policy = this.policy(plan);
      const quota = materializeQuota(
        { balance: account.quotaBalance, refreshedAt: account.quotaRefreshedAt },
        policy,
        now,
      );

      if (
        quota.balance !== account.quotaBalance
        || quota.refreshedAt.getTime() !== account.quotaRefreshedAt.getTime()
        || plan !== account.plan
      ) {
        await tx
          .update(accounts)
          .set({
            plan,
            planExpiresAt: plan === 'free' ? null : account.planExpiresAt,
            planProductId: plan === 'free' ? null : account.planProductId,
            quotaBalance: quota.balance,
            quotaRefreshedAt: quota.refreshedAt,
            updatedAt: now,
          })
          .where(eq(accounts.id, accountId));
      }

      return this.toView(plan, quota, policy, plan === 'pro' ? account.planExpiresAt : null);
    });
  }

  public async reserve(accountId: string, analysisId: string, now = new Date()): Promise<QuotaView> {
    return this.db.transaction(async (tx) => {
      const account = await this.lockAccount(tx, accountId);
      const plan = this.effectivePlan(account.plan, account.planExpiresAt, now);
      const policy = this.policy(plan);
      const [existingReservation] = await tx
        .select({ id: quotaEvents.id })
        .from(quotaEvents)
        .where(and(
          eq(quotaEvents.accountId, accountId),
          eq(quotaEvents.analysisId, analysisId),
          eq(quotaEvents.reason, 'analysis'),
        ))
        .limit(1);
      if (existingReservation) {
        const current = materializeQuota(
          { balance: account.quotaBalance, refreshedAt: account.quotaRefreshedAt },
          policy,
          now,
        );
        return this.toView(plan, current, policy, plan === 'pro' ? account.planExpiresAt : null);
      }
      const reservation = reserveOne(
        { balance: account.quotaBalance, refreshedAt: account.quotaRefreshedAt },
        policy,
        now,
      );

      if (!reservation.success) {
        throw new AppError(402, 'QUOTA_EXHAUSTED', 'No analysis attempts remaining', {
          nextRefillAt: reservation.quota.nextRefillAt?.toISOString() ?? null,
        });
      }

      const [event] = await tx
        .insert(quotaEvents)
        .values({ accountId, analysisId, delta: -1, reason: 'analysis' })
        .onConflictDoNothing({ target: [quotaEvents.analysisId, quotaEvents.reason] })
        .returning({ id: quotaEvents.id });
      if (!event) {
        const current = materializeQuota(
          { balance: account.quotaBalance, refreshedAt: account.quotaRefreshedAt },
          policy,
          now,
        );
        return this.toView(plan, current, policy, plan === 'pro' ? account.planExpiresAt : null);
      }

      await tx
        .update(accounts)
        .set({
          plan,
          planExpiresAt: plan === 'free' ? null : account.planExpiresAt,
          planProductId: plan === 'free' ? null : account.planProductId,
          quotaBalance: reservation.quota.balance,
          quotaRefreshedAt: reservation.quota.refreshedAt,
          updatedAt: now,
        })
        .where(eq(accounts.id, accountId));
      return this.toView(plan, reservation.quota, policy, plan === 'pro' ? account.planExpiresAt : null);
    });
  }

  public async reset(accountId: string, now = new Date()): Promise<QuotaView> {
    return this.db.transaction(async (tx) => {
      const account = await this.lockAccount(tx, accountId);
      const plan = this.effectivePlan(account.plan, account.planExpiresAt, now);
      const policy = this.policy(plan);
      await tx
        .update(accounts)
        .set({
          plan,
          planExpiresAt: plan === 'free' ? null : account.planExpiresAt,
          planProductId: plan === 'free' ? null : account.planProductId,
          quotaBalance: policy.max,
          quotaRefreshedAt: now,
          updatedAt: now,
        })
        .where(eq(accounts.id, accountId));
      return this.toView(
        plan,
        { balance: policy.max, nextRefillAt: null },
        policy,
        plan === 'pro' ? account.planExpiresAt : null,
      );
    });
  }

  public async refund(accountId: string, analysisId: string, now = new Date()): Promise<void> {
    await this.db.transaction(async (tx) => {
      const account = await this.lockAccount(tx, accountId);
      const [reservation] = await tx
        .select({ id: quotaEvents.id })
        .from(quotaEvents)
        .where(and(
          eq(quotaEvents.accountId, accountId),
          eq(quotaEvents.analysisId, analysisId),
          eq(quotaEvents.reason, 'analysis'),
        ))
        .limit(1);
      if (!reservation) {
        return;
      }
      const [event] = await tx
        .insert(quotaEvents)
        .values({ accountId, analysisId, delta: 1, reason: 'refund' })
        .onConflictDoNothing({ target: [quotaEvents.analysisId, quotaEvents.reason] })
        .returning({ id: quotaEvents.id });
      if (!event) {
        return;
      }
      const plan = this.effectivePlan(account.plan, account.planExpiresAt, now);
      const policy = this.policy(plan);
      const quota = refundOne(
        { balance: account.quotaBalance, refreshedAt: account.quotaRefreshedAt },
        policy,
        now,
      );

      await tx
        .update(accounts)
        .set({
          plan,
          planExpiresAt: plan === 'free' ? null : account.planExpiresAt,
          planProductId: plan === 'free' ? null : account.planProductId,
          quotaBalance: quota.balance,
          quotaRefreshedAt: quota.refreshedAt,
          updatedAt: now,
        })
        .where(eq(accounts.id, accountId));
    });
  }

  private policy(plan: 'free' | 'pro'): QuotaPolicy {
    return this.policies[plan];
  }

  private effectivePlan(plan: 'free' | 'pro', expiresAt: Date | null, now: Date): 'free' | 'pro' {
    if (plan === 'pro' && expiresAt !== null && expiresAt.getTime() <= now.getTime()) {
      return 'free';
    }
    return plan;
  }

  private async lockAccount(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    accountId: string,
  ) {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId)).for('update');
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    return account;
  }

  private toView(
    plan: 'free' | 'pro',
    quota: { balance: number; nextRefillAt: Date | null },
    policy: QuotaPolicy,
    planExpiresAt: Date | null,
  ): QuotaView {
    return {
      plan,
      remaining: quota.balance,
      limit: policy.max,
      nextRefillAt: quota.nextRefillAt?.toISOString() ?? null,
      planExpiresAt: planExpiresAt?.toISOString() ?? null,
    };
  }
}
