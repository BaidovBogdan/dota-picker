import { asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { accounts, billingEvents, billingTombstones } from '../../db/schema.js';
import { hmacSha256 } from '../../lib/crypto.js';
import { NotFoundError } from '../../lib/errors.js';
import type { QuotaService } from '../quota/quota.service.js';
import {
  hasTransferableRevenueCatEntitlement,
  resolvePlanAfterRevenueCatEvent,
} from './billing-plan.js';
import type { revenueCatWebhookSchema } from './billing.schemas.js';

type Webhook = z.infer<typeof revenueCatWebhookSchema>;
type WebhookEvent = Webhook['event'];
export type BillingApplyResult = 'processed' | 'pending' | 'ignored';

function parseAccountIds(identities: (string | null | undefined)[]) {
  return Array.from(new Set(identities.flatMap((identity) => {
    const parsed = z.uuid().safeParse(identity);
    return parsed.success ? [parsed.data] : [];
  })));
}

function minimalPayload(event: WebhookEvent, secret: string): Record<string, unknown> {
  const sourceIds = event.type === 'TRANSFER'
    ? parseAccountIds(event.transferred_from ?? [])
    : [];
  const destinationIds = event.type === 'TRANSFER'
    ? parseAccountIds(event.transferred_to ?? [])
    : parseAccountIds([event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])]);
  return {
    eventId: event.id,
    type: event.type,
    sourceIdentityHashes: sourceIds.map((id) => hmacSha256(secret, id)),
    destinationIdentityHashes: destinationIds.map((id) => hmacSha256(secret, id)),
    eventTimestampMs: event.event_timestamp_ms ?? null,
    expirationAtMs: event.expiration_at_ms ?? null,
    productId: event.product_id ?? null,
    entitlementIds: event.entitlement_ids ?? [],
    entitlementId: event.entitlement_id ?? null,
    environment: event.environment ?? null,
    appId: event.app_id ?? null,
  };
}

export class BillingService {
  public constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
    private readonly quotaService: QuotaService,
  ) {}

  public async status(accountId: string) {
    const [account] = await this.db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    const quota = await this.quotaService.get(accountId);
    return {
      revenueCatAppUserId: account.id,
      plan: quota.plan,
      entitlement: {
        id: this.config.revenueCat.proEntitlementId,
        active: quota.plan === 'pro',
        productId: quota.plan === 'pro' ? account.planProductId : null,
        expiresAt: quota.plan === 'pro' ? account.planExpiresAt?.toISOString() ?? null : null,
      },
      quota,
    };
  }

  public async applyRevenueCatEvent(payload: Webhook): Promise<BillingApplyResult> {
    const event = payload.event;
    return this.db.transaction(async (tx) => {
      const now = new Date();
      if (event.environment === 'SANDBOX' && !this.config.revenueCat.allowSandbox) {
        return 'ignored';
      }
      if (
        this.config.revenueCat.appIds.length > 0
        && (!event.app_id || !this.config.revenueCat.appIds.includes(event.app_id))
      ) {
        return 'ignored';
      }

      const destinationIds = event.type === 'TRANSFER'
        ? parseAccountIds(event.transferred_to ?? [])
        : parseAccountIds([event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])]);
      const sourceIds = event.type === 'TRANSFER' ? parseAccountIds(event.transferred_from ?? []) : [];
      const lockedIds = Array.from(new Set([...destinationIds, ...sourceIds])).sort();
      const lockedAccounts = lockedIds.length > 0
        ? await tx
            .select()
            .from(accounts)
            .where(inArray(accounts.id, lockedIds))
            .orderBy(asc(accounts.id))
            .for('update')
        : [];

      await tx.delete(billingTombstones).where(lte(billingTombstones.retainUntil, now));
      const hashesById = new Map(lockedIds.map((id) => [id, hmacSha256(this.config.jwtSecret, id)]));
      const hashes = [...hashesById.values()];
      const lockedTombstones = hashes.length > 0
        ? await tx
            .select()
            .from(billingTombstones)
            .where(inArray(billingTombstones.accountHash, hashes))
            .orderBy(asc(billingTombstones.accountHash))
            .for('update')
        : [];
      const tombstoneById = new Map(lockedIds.flatMap((id) => {
        const hash = hashesById.get(id);
        const tombstone = lockedTombstones.find((candidate) => candidate.accountHash === hash);
        return tombstone ? [[id, tombstone] as const] : [];
      }));

      const account = destinationIds
        .map((id) => lockedAccounts.find((candidate) => candidate.id === id))
        .find((candidate) => candidate !== undefined);
      const destinationTombstone = destinationIds
        .map((id) => tombstoneById.get(id))
        .find((candidate) => candidate !== undefined);

      await tx
        .insert(billingEvents)
        .values({
          eventId: event.id,
          accountId: account?.id ?? null,
          type: event.type,
          payload: minimalPayload(event, this.config.jwtSecret),
          status: 'pending',
          attempts: 0,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: billingEvents.eventId });
      const [record] = await tx
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.eventId, event.id))
        .for('update');
      if (!record) {
        return 'pending';
      }
      if (record.status === 'processed') {
        return 'processed';
      }

      await tx
        .update(billingEvents)
        .set({
          accountId: account?.id ?? record.accountId,
          payload: minimalPayload(event, this.config.jwtSecret),
          attempts: sql`${billingEvents.attempts} + 1`,
          updatedAt: now,
        })
        .where(eq(billingEvents.eventId, event.id));
      const markProcessed = async (processedAccountId: string | null = account?.id ?? null) => {
        await tx
          .update(billingEvents)
          .set({
            accountId: processedAccountId,
            status: 'processed',
            processedAt: now,
            updatedAt: now,
          })
          .where(eq(billingEvents.eventId, event.id));
        return 'processed' as const;
      };
      const eventAt = typeof event.event_timestamp_ms === 'number'
        ? new Date(event.event_timestamp_ms)
        : now;
      const expiresAt = typeof event.expiration_at_ms === 'number'
        ? new Date(event.expiration_at_ms)
        : null;
      const terminal = new Set(['EXPIRATION', 'REFUND']).has(event.type);
      const grantsQuota = new Set([
        'INITIAL_PURCHASE',
        'RENEWAL',
        'NON_RENEWING_PURCHASE',
        'PURCHASE_REDEEMED',
      ]).has(event.type);

      if (!account && destinationTombstone && event.type !== 'TRANSFER') {
        if (
          destinationTombstone.billingUpdatedAt
          && destinationTombstone.billingUpdatedAt.getTime() > eventAt.getTime()
        ) {
          return markProcessed();
        }
        const entitlementPresent = (event.entitlement_ids ?? []).includes(this.config.revenueCat.proEntitlementId)
          || event.entitlement_id === this.config.revenueCat.proEntitlementId
          || (
            terminal
            && destinationTombstone.hasEntitlement
            && (!event.product_id || destinationTombstone.planProductId === event.product_id)
          );
        if (!entitlementPresent) {
          return markProcessed();
        }

        const active = !terminal && (expiresAt === null || expiresAt.getTime() > now.getTime());
        const proPolicy = this.config.quota.pro;
        const retainCandidate = active && expiresAt
          ? new Date(expiresAt.getTime() + 30 * 24 * 60 * 60 * 1_000)
          : destinationTombstone.retainUntil;
        await tx
          .update(billingTombstones)
          .set({
            hasEntitlement: active,
            planProductId: active ? event.product_id ?? null : null,
            planExpiresAt: active ? expiresAt : null,
            quotaBalance: active
              ? (grantsQuota ? proPolicy.max : Math.min(destinationTombstone.quotaBalance ?? proPolicy.max, proPolicy.max))
              : null,
            quotaRefreshedAt: active ? destinationTombstone.quotaRefreshedAt ?? now : null,
            billingUpdatedAt: eventAt,
            retainUntil: retainCandidate.getTime() > destinationTombstone.retainUntil.getTime()
              ? retainCandidate
              : destinationTombstone.retainUntil,
          })
          .where(eq(billingTombstones.accountHash, destinationTombstone.accountHash));
        return markProcessed();
      }

      if (!account && destinationTombstone && event.type === 'TRANSFER') {
        const sourceAccounts = sourceIds.flatMap((id) => {
          const candidate = lockedAccounts.find((current) => current.id === id);
          return candidate ? [candidate] : [];
        });
        const sourceTombstones = sourceIds.flatMap((id) => {
          const candidate = tombstoneById.get(id);
          return candidate && candidate.accountHash !== destinationTombstone.accountHash ? [candidate] : [];
        });
        const sourceAccount = sourceAccounts.find((candidate) => (
          hasTransferableRevenueCatEntitlement(candidate, now)
        ));
        const sourceTombstone = sourceTombstones.find((candidate) => (
          candidate.hasEntitlement
          && (candidate.planExpiresAt === null || candidate.planExpiresAt.getTime() > now.getTime())
        ));
        const destinationHasNewerState = Boolean(
          destinationTombstone.billingUpdatedAt
          && destinationTombstone.billingUpdatedAt.getTime() > eventAt.getTime(),
        );
        const sourceHasNewerState = [...sourceAccounts, ...sourceTombstones].some((candidate) => (
          candidate.billingUpdatedAt && candidate.billingUpdatedAt.getTime() > eventAt.getTime()
        ));

        if (sourceHasNewerState) {
          return markProcessed();
        }
        if (destinationHasNewerState) {
          if (sourceAccount) {
            await this.releaseSourceAccount(tx, sourceAccount, eventAt, now);
          }
          if (sourceTombstone) {
            await this.releaseSourceTombstone(tx, sourceTombstone, eventAt);
          }
          return markProcessed();
        }

        const source = sourceAccount ?? sourceTombstone;
        if (!source) {
          return destinationTombstone.hasEntitlement ? markProcessed() : 'pending';
        }
        const proPolicy = this.config.quota.pro;
        const sourceBalance = source.quotaBalance ?? proPolicy.max;
        const retainCandidate = source.planExpiresAt
          ? new Date(source.planExpiresAt.getTime() + 30 * 24 * 60 * 60 * 1_000)
          : destinationTombstone.retainUntil;
        await tx
          .update(billingTombstones)
          .set({
            hasEntitlement: true,
            planProductId: source.planProductId,
            planExpiresAt: source.planExpiresAt,
            quotaBalance: Math.max(
              destinationTombstone.quotaBalance ?? 0,
              Math.min(sourceBalance, proPolicy.max),
            ),
            quotaRefreshedAt: source.quotaRefreshedAt ?? now,
            billingUpdatedAt: eventAt,
            retainUntil: retainCandidate.getTime() > destinationTombstone.retainUntil.getTime()
              ? retainCandidate
              : destinationTombstone.retainUntil,
          })
          .where(eq(billingTombstones.accountHash, destinationTombstone.accountHash));
        if (sourceAccount) {
          await this.releaseSourceAccount(tx, sourceAccount, eventAt, now);
        }
        if (sourceTombstone) {
          await this.releaseSourceTombstone(tx, sourceTombstone, eventAt);
        }
        return markProcessed();
      }

      if (!account) {
        return 'pending';
      }

      if (event.type === 'TRANSFER') {
        const sourceAccounts = sourceIds.flatMap((id) => {
          const candidate = lockedAccounts.find((current) => current.id === id);
          return candidate && candidate.id !== account.id ? [candidate] : [];
        });
        const sourceTombstones = sourceIds.flatMap((id) => {
          const candidate = tombstoneById.get(id);
          return candidate ? [candidate] : [];
        });
        const sourceAccount = sourceAccounts.find((candidate) => (
          hasTransferableRevenueCatEntitlement(candidate, now)
        ));
        const sourceTombstone = sourceTombstones.find((candidate) => (
          candidate.hasEntitlement
          && (candidate.planExpiresAt === null || candidate.planExpiresAt.getTime() > now.getTime())
        ));
        const destinationHasNewerState = Boolean(
          account.billingUpdatedAt && account.billingUpdatedAt.getTime() > eventAt.getTime(),
        );
        const sourceHasNewerState = [...sourceAccounts, ...sourceTombstones].some((candidate) => (
          candidate.billingUpdatedAt && candidate.billingUpdatedAt.getTime() > eventAt.getTime()
        ));

        if (destinationHasNewerState || sourceHasNewerState) {
          if (sourceAccount && !sourceHasNewerState) {
            await this.releaseSourceAccount(tx, sourceAccount, eventAt, now);
          }
          if (sourceTombstone && !sourceHasNewerState) {
            await this.releaseSourceTombstone(tx, sourceTombstone, eventAt);
          }
          return markProcessed();
        }

        const source = sourceAccount ?? sourceTombstone;
        const sourceIsActive = Boolean(
          source
          && (sourceAccount ? sourceAccount.plan === 'pro' : sourceTombstone?.hasEntitlement)
          && (source.planExpiresAt === null || source.planExpiresAt.getTime() > now.getTime()),
        );
        if (!sourceIsActive) {
          const destinationIsActive = account.plan === 'pro'
            && (account.planExpiresAt === null || account.planExpiresAt.getTime() > now.getTime());
          return destinationIsActive ? markProcessed() : 'pending';
        }

        const proPolicy = this.config.quota.pro;
        const sourceBalance = source?.quotaBalance ?? proPolicy.max;
        await tx
          .update(accounts)
          .set({
            plan: 'pro',
            planProductId: source?.planProductId ?? null,
            planExpiresAt: source?.planExpiresAt ?? null,
            billingUpdatedAt: eventAt,
            quotaBalance: Math.max(account.quotaBalance, Math.min(sourceBalance, proPolicy.max)),
            quotaRefreshedAt: source?.quotaRefreshedAt ?? now,
            updatedAt: now,
          })
          .where(eq(accounts.id, account.id));
        if (sourceAccount) {
          await this.releaseSourceAccount(tx, sourceAccount, eventAt, now);
        }
        if (sourceTombstone) {
          await this.releaseSourceTombstone(tx, sourceTombstone, eventAt);
        }
        return markProcessed();
      }

      if (account.billingUpdatedAt && account.billingUpdatedAt.getTime() > eventAt.getTime()) {
        return markProcessed();
      }
      const entitlementPresent = (event.entitlement_ids ?? []).includes(this.config.revenueCat.proEntitlementId)
        || event.entitlement_id === this.config.revenueCat.proEntitlementId
        || (
          terminal
          && account.plan === 'pro'
          && (!event.product_id || account.planProductId === event.product_id)
        );
      if (!entitlementPresent) {
        return markProcessed();
      }

      const revenueCatActive = !terminal && (expiresAt === null || expiresAt.getTime() > now.getTime());
      const resolvedPlan = resolvePlanAfterRevenueCatEvent({
        complimentaryPro: account.complimentaryPro,
        revenueCatActive,
        revenueCatProductId: event.product_id ?? null,
        revenueCatExpiresAt: expiresAt,
      });
      const policy = this.config.quota[resolvedPlan.plan];
      const nextBalance = revenueCatActive
        ? (grantsQuota ? policy.max : Math.min(account.quotaBalance, policy.max))
        : Math.min(account.quotaBalance, policy.max);
      await tx
        .update(accounts)
        .set({
          ...resolvedPlan,
          billingUpdatedAt: eventAt,
          quotaBalance: nextBalance,
          quotaRefreshedAt: now,
          updatedAt: now,
        })
        .where(eq(accounts.id, account.id));
      return markProcessed();
    });
  }

  private async releaseSourceAccount(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    account: typeof accounts.$inferSelect,
    eventAt: Date,
    now: Date,
  ) {
    const resolvedPlan = resolvePlanAfterRevenueCatEvent({
      complimentaryPro: account.complimentaryPro,
      revenueCatActive: false,
      revenueCatProductId: null,
      revenueCatExpiresAt: null,
    });
    const policy = this.config.quota[resolvedPlan.plan];
    await tx
      .update(accounts)
      .set({
        ...resolvedPlan,
        billingUpdatedAt: eventAt,
        quotaBalance: Math.min(account.quotaBalance, policy.max),
        quotaRefreshedAt: now,
        updatedAt: now,
      })
      .where(eq(accounts.id, account.id));
  }

  private async releaseSourceTombstone(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    tombstone: typeof billingTombstones.$inferSelect,
    eventAt: Date,
  ) {
    await tx
      .update(billingTombstones)
      .set({
        hasEntitlement: false,
        planProductId: null,
        planExpiresAt: null,
        quotaBalance: null,
        quotaRefreshedAt: null,
        billingUpdatedAt: eventAt,
      })
      .where(eq(billingTombstones.accountHash, tombstone.accountHash));
  }
}
