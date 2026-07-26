import argon2 from 'argon2';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AppConfig } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import {
  accounts,
  billingEvents,
  billingTombstones,
  refreshTokens,
  type Account,
} from '../../db/schema.js';
import { createOpaqueToken, hmacSha256, sha256 } from '../../lib/crypto.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../lib/errors.js';

type TokenContext = {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
};

function hasErrorCode(error: unknown, code: string) {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return false;
    }
    if (Reflect.get(current, 'code') === code) {
      return true;
    }
    current = Reflect.get(current, 'cause');
  }
  return false;
}

export class AuthService {
  public constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  public async findOrCreateGuest(deviceId: string): Promise<Account> {
    const [existing] = await this.db.select().from(accounts).where(eq(accounts.deviceId, deviceId)).limit(1);
    if (existing) {
      if (existing.kind !== 'guest') {
        throw new ConflictError('ACCOUNT_CONFLICT', 'This device is linked to a registered account; sign in with email');
      }
      return existing;
    }

    const now = new Date();
    const [created] = await this.db
      .insert(accounts)
      .values({
        kind: 'guest',
        deviceId,
        quotaBalance: this.config.quota.free.max,
        quotaRefreshedAt: now,
      })
      .onConflictDoNothing({ target: accounts.deviceId })
      .returning();

    if (created) {
      return created;
    }

    const [concurrent] = await this.db.select().from(accounts).where(eq(accounts.deviceId, deviceId)).limit(1);
    if (concurrent?.kind !== 'guest') {
      throw new ConflictError('ACCOUNT_CONFLICT', 'Unable to create guest account');
    }
    return concurrent;
  }

  public async register(email: string, password: string): Promise<Account> {
    const passwordHash = await this.hashPassword(password);
    const now = new Date();
    const [account] = await this.db
      .insert(accounts)
      .values({
        kind: 'user',
        email,
        passwordHash,
        quotaBalance: this.config.quota.free.max,
        quotaRefreshedAt: now,
      })
      .onConflictDoNothing({ target: accounts.email })
      .returning();

    if (!account) {
      throw new ConflictError('ACCOUNT_EXISTS', 'An account with this email already exists');
    }
    return account;
  }

  public async upgradeGuest(accountId: string, email: string, password: string): Promise<Account> {
    const passwordHash = await this.hashPassword(password);
    try {
      return await this.db.transaction(async (tx) => {
        const [current] = await tx.select().from(accounts).where(eq(accounts.id, accountId)).for('update');
        if (!current) {
          throw new NotFoundError('Account not found');
        }
        if (current.kind !== 'guest' || current.email !== null) {
          throw new ConflictError('ACCOUNT_CONFLICT', 'Only a guest account can be upgraded');
        }

        const now = new Date();
        const [account] = await tx
          .update(accounts)
          .set({
            kind: 'user',
            deviceId: null,
            email,
            passwordHash,
            tokenVersion: sql`${accounts.tokenVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(accounts.id, accountId))
          .returning();
        if (!account) {
          throw new NotFoundError('Account not found');
        }

        await tx
          .update(refreshTokens)
          .set({ revokedAt: now })
          .where(and(eq(refreshTokens.accountId, accountId), isNull(refreshTokens.revokedAt)));
        return account;
      });
    } catch (error) {
      if (hasErrorCode(error, '23505')) {
        throw new ConflictError('ACCOUNT_EXISTS', 'An account with this email already exists');
      }
      throw error;
    }
  }

  public async login(email: string, password: string): Promise<Account> {
    const [account] = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.email, email), eq(accounts.kind, 'user')))
      .limit(1);

    if (!account?.passwordHash || !(await argon2.verify(account.passwordHash, password))) {
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    return account;
  }

  public async getAccount(accountId: string): Promise<Account> {
    const [account] = await this.db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    return account;
  }

  public async deleteAccount(accountId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!account) {
        throw new NotFoundError('Account not found');
      }
      const now = new Date();
      const activePro = account.plan === 'pro'
        && (account.planExpiresAt === null || account.planExpiresAt.getTime() > now.getTime());
      const retainUntil = activePro && account.planExpiresAt
          ? new Date(account.planExpiresAt.getTime() + 30 * 24 * 60 * 60 * 1_000)
          : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1_000);
      const accountHash = hmacSha256(this.config.jwtSecret, account.id);
      await tx
        .insert(billingTombstones)
        .values({
          accountHash,
          hasEntitlement: activePro,
          planProductId: activePro ? account.planProductId : null,
          planExpiresAt: activePro ? account.planExpiresAt : null,
          quotaBalance: activePro ? account.quotaBalance : null,
          quotaRefreshedAt: activePro ? account.quotaRefreshedAt : null,
          billingUpdatedAt: account.billingUpdatedAt,
          retainUntil,
        })
        .onConflictDoUpdate({
          target: billingTombstones.accountHash,
          set: {
            planProductId: activePro ? account.planProductId : null,
            hasEntitlement: activePro,
            planExpiresAt: activePro ? account.planExpiresAt : null,
            quotaBalance: activePro ? account.quotaBalance : null,
            quotaRefreshedAt: activePro ? account.quotaRefreshedAt : null,
            billingUpdatedAt: account.billingUpdatedAt,
            retainUntil,
          },
        });
      await tx.delete(billingEvents).where(eq(billingEvents.accountId, accountId));
      const [deleted] = await tx
        .delete(accounts)
        .where(eq(accounts.id, accountId))
        .returning({ id: accounts.id });
      if (!deleted) throw new NotFoundError('Account not found');
    });
  }

  public async createRefreshToken(
    accountId: string,
    expected: Pick<Account, 'kind' | 'tokenVersion'>,
    context: TokenContext,
  ): Promise<string> {
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1_000);
    await this.db.transaction(async (tx) => {
      const [account] = await tx
        .select({ kind: accounts.kind, tokenVersion: accounts.tokenVersion })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (
        account?.kind !== expected.kind ||
        account.tokenVersion !== expected.tokenVersion
      ) {
        throw new UnauthorizedError('TOKEN_INVALID', 'Account state changed; retry authentication');
      }
      await tx.insert(refreshTokens).values({
        accountId,
        tokenHash: sha256(token),
        expiresAt,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      });
    });
    return token;
  }

  public async rotateRefreshToken(token: string, context: TokenContext): Promise<{ account: Account; refreshToken: string }> {
    const outcome = await this.db.transaction(async (tx) => {
      const tokenHash = sha256(token);
      const [stored] = await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).for('update');
      if (!stored) {
        return { kind: 'invalid' as const };
      }

      if (stored.expiresAt.getTime() <= Date.now()) {
        if (!stored.revokedAt) {
          await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, stored.id));
        }
        return { kind: 'expired' as const };
      }

      if (stored.revokedAt) {
        if (stored.replacedById) {
          const now = new Date();
          await tx
            .update(refreshTokens)
            .set({ revokedAt: now })
            .where(and(eq(refreshTokens.familyId, stored.familyId), isNull(refreshTokens.revokedAt)));
          await tx
            .update(accounts)
            .set({ tokenVersion: sql`${accounts.tokenVersion} + 1`, updatedAt: now })
            .where(eq(accounts.id, stored.accountId));
          return { kind: 'reused' as const };
        }
        return { kind: 'invalid' as const };
      }

      const [account] = await tx.select().from(accounts).where(eq(accounts.id, stored.accountId)).limit(1);
      if (!account) {
        return { kind: 'invalid' as const };
      }

      const nextToken = createOpaqueToken();
      const [next] = await tx
        .insert(refreshTokens)
        .values({
          accountId: account.id,
          familyId: stored.familyId,
          tokenHash: sha256(nextToken),
          expiresAt: new Date(Date.now() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1_000),
          userAgent: context.userAgent,
          ipAddress: context.ipAddress,
        })
        .returning({ id: refreshTokens.id });

      if (!next) {
        throw new Error('Failed to rotate refresh token');
      }

      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedById: next.id })
        .where(eq(refreshTokens.id, stored.id));

      return { kind: 'rotated' as const, account, refreshToken: nextToken };
    });

    if (outcome.kind === 'reused') {
      throw new UnauthorizedError('TOKEN_REUSED', 'Refresh token reuse detected; all sessions were revoked');
    }
    if (outcome.kind === 'expired') {
      throw new UnauthorizedError('TOKEN_INVALID', 'Refresh token has expired');
    }
    if (outcome.kind === 'invalid') {
      throw new UnauthorizedError('TOKEN_INVALID', 'Refresh token is invalid');
    }
    return { account: outcome.account, refreshToken: outcome.refreshToken };
  }

  public async revokeRefreshToken(token: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [stored] = await tx
        .select({ accountId: refreshTokens.accountId, familyId: refreshTokens.familyId })
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, sha256(token)))
        .for('update');
      if (!stored) return;

      const now = new Date();
      const revoked = await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(
          eq(refreshTokens.familyId, stored.familyId),
          isNull(refreshTokens.revokedAt),
        ))
        .returning({ id: refreshTokens.id });
      if (revoked.length === 0) return;

      await tx
        .update(accounts)
        .set({ tokenVersion: sql`${accounts.tokenVersion} + 1`, updatedAt: now })
        .where(eq(accounts.id, stored.accountId));
    });
  }

  private async hashPassword(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
  }
}
