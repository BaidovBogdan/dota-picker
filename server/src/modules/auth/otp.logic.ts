import { secureEqualHex } from '../../lib/crypto.js';

export type OtpPurpose =
  | 'register'
  | 'login'
  | 'upgrade_guest'
  | 'password_reset'
  | 'password_change';

export type OtpChallengeState = {
  purpose: OtpPurpose;
  emailHash: string;
  accountId: string | null;
  tokenVersion: number | null;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
};

type ExpectedOtp = {
  purpose: OtpPurpose;
  emailHash: string;
  accountId: string | null;
  tokenVersion: number | null;
  codeHash: string;
  now: Date;
};

export type OtpEvaluation =
  | { kind: 'valid' }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'exhausted' };

export function otpSubjectKey(accountId: string | null, emailHash: string) {
  return accountId === null ? `email:${emailHash}` : `account:${accountId}`;
}

export function evaluateOtpChallenge(challenge: OtpChallengeState, expected: ExpectedOtp): OtpEvaluation {
  if (
    challenge.consumedAt !== null
    || challenge.purpose !== expected.purpose
    || challenge.emailHash !== expected.emailHash
    || challenge.accountId !== expected.accountId
    || challenge.tokenVersion !== expected.tokenVersion
  ) {
    return { kind: 'invalid' };
  }
  if (challenge.expiresAt.getTime() <= expected.now.getTime()) {
    return { kind: 'expired' };
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    return { kind: 'exhausted' };
  }
  if (!secureEqualHex(challenge.codeHash, expected.codeHash)) {
    return challenge.attempts + 1 >= challenge.maxAttempts
      ? { kind: 'exhausted' }
      : { kind: 'invalid' };
  }
  return { kind: 'valid' };
}
