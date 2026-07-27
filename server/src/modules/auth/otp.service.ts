import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { AppConfig } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { otpChallenges } from '../../db/schema.js';
import { hmacSha256 } from '../../lib/crypto.js';
import {
  ExternalServiceError,
  OtpError,
  RateLimitError,
} from '../../lib/errors.js';
import { evaluateOtpChallenge, otpSubjectKey, type OtpPurpose } from './otp.logic.js';

type ChallengeBinding = {
  purpose: OtpPurpose;
  email: string;
  accountId: string | null;
  tokenVersion: number | null;
};

type ConsumeInput = ChallengeBinding & {
  challengeId: string;
  code: string;
};

export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type OtpChallengeResponse = {
  challengeId: string;
  purpose: OtpPurpose;
  expiresAt: string;
  retryAfterSeconds: number;
};

export class OtpService {
  public constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  public async request(binding: ChallengeBinding): Promise<OtpChallengeResponse> {
    const code = this.config.otp.staticCode;
    if (!code) {
      throw new ExternalServiceError('Email verification is not configured yet');
    }

    const now = new Date();
    const emailHash = this.emailHash(binding.email);
    const challengeId = randomUUID();
    const expiresAt = new Date(now.getTime() + this.config.otp.ttlMs);
    const retryAfterSeconds = Math.ceil(this.config.otp.resendCooldownMs / 1_000);
    const requestWindowStart = new Date(now.getTime() - this.config.otp.requestWindowMs);
    const accountCondition = binding.accountId === null
      ? isNull(otpChallenges.accountId)
      : eq(otpChallenges.accountId, binding.accountId);
    const lockKey = hmacSha256(
      this.otpSecret(),
      `request:${binding.purpose}:${emailHash}:${binding.accountId ?? 'none'}`,
    );

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      await tx
        .delete(otpChallenges)
        .where(lt(otpChallenges.expiresAt, new Date(now.getTime() - 24 * 60 * 60 * 1_000)));

      const recent = await tx
        .select({ createdAt: otpChallenges.createdAt })
        .from(otpChallenges)
        .where(and(
          eq(otpChallenges.purpose, binding.purpose),
          eq(otpChallenges.emailHash, emailHash),
          accountCondition,
          gte(otpChallenges.createdAt, requestWindowStart),
        ))
        .orderBy(desc(otpChallenges.createdAt))
        .limit(this.config.otp.maxRequestsPerWindow)
        .for('update');

      const latest = recent[0];
      if (latest) {
        const availableAt = latest.createdAt.getTime() + this.config.otp.resendCooldownMs;
        if (availableAt > now.getTime()) {
          throw new RateLimitError(
            'Wait before requesting another verification code',
            Math.ceil((availableAt - now.getTime()) / 1_000),
          );
        }
      }
      if (recent.length >= this.config.otp.maxRequestsPerWindow) {
        const oldest = recent.at(-1);
        const availableAt = (oldest?.createdAt.getTime() ?? now.getTime()) + this.config.otp.requestWindowMs;
        throw new RateLimitError(
          'Too many verification codes requested',
          Math.max(1, Math.ceil((availableAt - now.getTime()) / 1_000)),
        );
      }

      await tx
        .update(otpChallenges)
        .set({ consumedAt: now })
        .where(and(
          eq(otpChallenges.purpose, binding.purpose),
          eq(otpChallenges.emailHash, emailHash),
          accountCondition,
          isNull(otpChallenges.consumedAt),
        ));

      await tx.insert(otpChallenges).values({
        id: challengeId,
        purpose: binding.purpose,
        emailHash,
        accountId: binding.accountId,
        tokenVersion: binding.tokenVersion,
        codeHash: this.codeHash(challengeId, code),
        maxAttempts: this.config.otp.maxAttempts,
        expiresAt,
        createdAt: now,
      });
    });

    return {
      challengeId,
      purpose: binding.purpose,
      expiresAt: expiresAt.toISOString(),
      retryAfterSeconds,
    };
  }

  public async consumeAndRun<T>(
    input: ConsumeInput,
    operation: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    const emailHash = this.emailHash(input.email);
    const subject = otpSubjectKey(input.accountId, emailHash);
    const lockKey = hmacSha256(this.otpSecret(), `consume:${subject}`);
    const result = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const now = new Date();
      const [challenge] = await tx
        .select()
        .from(otpChallenges)
        .where(eq(otpChallenges.id, input.challengeId))
        .for('update');

      if (!challenge) {
        return { kind: 'invalid' as const };
      }

      const evaluation = evaluateOtpChallenge(challenge, {
        purpose: input.purpose,
        emailHash,
        accountId: input.accountId,
        tokenVersion: input.tokenVersion,
        codeHash: this.codeHash(input.challengeId, input.code),
        now,
      });

      if (evaluation.kind === 'valid') {
        const value = await operation(tx);
        await tx
          .update(otpChallenges)
          .set({ consumedAt: now })
          .where(eq(otpChallenges.id, challenge.id));
        return { kind: 'valid' as const, value };
      }

      if (evaluation.kind === 'expired') {
        await tx
          .update(otpChallenges)
          .set({ consumedAt: now })
          .where(eq(otpChallenges.id, challenge.id));
        return { kind: 'expired' as const };
      }

      if (evaluation.kind === 'exhausted') {
        await tx
          .update(otpChallenges)
          .set({
            attempts: Math.min(challenge.attempts + 1, challenge.maxAttempts),
            consumedAt: now,
          })
          .where(eq(otpChallenges.id, challenge.id));
        return { kind: 'exhausted' as const };
      }

      if (
        challenge.consumedAt === null
        && challenge.purpose === input.purpose
        && challenge.emailHash === emailHash
        && challenge.accountId === input.accountId
        && challenge.tokenVersion === input.tokenVersion
      ) {
        await tx
          .update(otpChallenges)
          .set({ attempts: Math.min(challenge.attempts + 1, challenge.maxAttempts) })
          .where(eq(otpChallenges.id, challenge.id));
      }
      return { kind: 'invalid' as const };
    });

    if (result.kind === 'expired') {
      throw new OtpError('OTP_EXPIRED', 'Verification code has expired');
    }
    if (result.kind === 'exhausted') {
      throw new OtpError('OTP_ATTEMPTS_EXHAUSTED', 'Too many invalid verification attempts');
    }
    if (result.kind === 'invalid') {
      throw new OtpError('OTP_INVALID', 'Verification code is invalid');
    }
    return result.value;
  }

  private emailHash(email: string) {
    return hmacSha256(this.otpSecret(), email.trim().toLowerCase());
  }

  private codeHash(challengeId: string, code: string) {
    return hmacSha256(this.otpSecret(), `${challengeId}:${code}`);
  }

  private otpSecret() {
    return hmacSha256(this.config.jwtSecret, 'dota-picker:otp:v1');
  }
}
