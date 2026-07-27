import { describe, expect, it } from 'vitest';
import {
  evaluateOtpChallenge,
  otpSubjectKey,
  type OtpChallengeState,
} from '../src/modules/auth/otp.logic.js';
import { OtpError } from '../src/lib/errors.js';

const now = new Date('2026-07-27T12:00:00.000Z');
const validHash = 'a'.repeat(64);

function challenge(overrides: Partial<OtpChallengeState> = {}): OtpChallengeState {
  return {
    purpose: 'login',
    emailHash: 'email-hash',
    accountId: 'account-id',
    tokenVersion: 4,
    codeHash: validHash,
    attempts: 0,
    maxAttempts: 5,
    expiresAt: new Date(now.getTime() + 60_000),
    consumedAt: null,
    ...overrides,
  };
}

function expected(overrides: Record<string, unknown> = {}) {
  return {
    purpose: 'login' as const,
    emailHash: 'email-hash',
    accountId: 'account-id',
    tokenVersion: 4,
    codeHash: validHash,
    now,
    ...overrides,
  };
}

describe('OTP challenge evaluation', () => {
  it('uses non-authentication HTTP statuses for code failures', () => {
    expect(new OtpError('OTP_INVALID', 'invalid').statusCode).toBe(400);
    expect(new OtpError('OTP_EXPIRED', 'expired').statusCode).toBe(410);
    expect(new OtpError('OTP_ATTEMPTS_EXHAUSTED', 'exhausted').statusCode).toBe(429);
  });

  it('serializes every purpose for the same account under one subject', () => {
    expect(otpSubjectKey('account-id', 'first-email')).toBe('account:account-id');
    expect(otpSubjectKey('account-id', 'second-email')).toBe('account:account-id');
    expect(otpSubjectKey(null, 'email-hash')).toBe('email:email-hash');
  });

  it('accepts only a live unused challenge with the exact binding', () => {
    expect(evaluateOtpChallenge(challenge(), expected())).toEqual({ kind: 'valid' });
    expect(evaluateOtpChallenge(challenge({ consumedAt: now }), expected())).toEqual({ kind: 'invalid' });
    expect(evaluateOtpChallenge(challenge(), expected({ purpose: 'password_reset' }))).toEqual({ kind: 'invalid' });
    expect(evaluateOtpChallenge(challenge(), expected({ emailHash: 'other-email' }))).toEqual({ kind: 'invalid' });
    expect(evaluateOtpChallenge(challenge(), expected({ accountId: 'other-account' }))).toEqual({ kind: 'invalid' });
    expect(evaluateOtpChallenge(challenge(), expected({ tokenVersion: 5 }))).toEqual({ kind: 'invalid' });
  });

  it('rejects expired and exhausted challenges', () => {
    expect(evaluateOtpChallenge(
      challenge({ expiresAt: new Date(now.getTime() - 1) }),
      expected(),
    )).toEqual({ kind: 'expired' });
    expect(evaluateOtpChallenge(challenge({ attempts: 5 }), expected())).toEqual({ kind: 'exhausted' });
  });

  it('exhausts the challenge on the final invalid code attempt', () => {
    expect(evaluateOtpChallenge(
      challenge({ attempts: 3 }),
      expected({ codeHash: 'b'.repeat(64) }),
    )).toEqual({ kind: 'invalid' });
    expect(evaluateOtpChallenge(
      challenge({ attempts: 4 }),
      expected({ codeHash: 'b'.repeat(64) }),
    )).toEqual({ kind: 'exhausted' });
  });
});
