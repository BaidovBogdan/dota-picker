import { describe, expect, it } from 'vitest';
import {
  diagnosticAdminEventSchema,
  diagnosticBatchInputSchema,
  diagnosticsBatchLimit,
  diagnosticsBodyLimitBytes,
  diagnosticsConsentVersion,
  diagnosticsRetentionDays,
} from '../src/modules/diagnostics/diagnostics.schemas.js';

const sessionId = '11111111-1111-4111-8111-111111111111';

function event(sequence = 1) {
  return {
    id: `${String(sequence).padStart(8, '0')}-1111-4111-8111-111111111111`,
    sequence,
    type: 'recognition_result' as const,
    status: 'success' as const,
    stage: 'recognition' as const,
    createdAt: '2026-08-09T10:00:01.000Z',
    durationMs: 820,
    details: {
      revision: 2,
      quality: 'clear' as const,
      model: 'portrait-index-v3',
      recognizedCount: 2,
      needsReviewCount: 0,
      slots: [
        {
          slot: 0,
          side: 'ally' as const,
          visualGroup: 'left' as const,
          heroId: 14,
          confidence: 0.98,
          needsReview: false,
        },
      ],
    },
  };
}

function batch() {
  return {
    session: {
      id: sessionId,
      platform: 'win32' as const,
      appVersion: '0.1.12',
      appBuild: '0.1.12+410bbe0',
      mode: 'vision' as const,
      startedAt: '2026-08-09T10:00:00.000Z',
      consentVersion: diagnosticsConsentVersion,
    },
    events: [event()],
  };
}

describe('diagnostics contract', () => {
  it('accepts bounded privacy-safe recognition diagnostics', () => {
    expect(diagnosticBatchInputSchema.parse(batch())).toEqual(batch());
    expect(diagnosticsRetentionDays).toBe(30);
    expect(diagnosticsBatchLimit).toBe(20);
    expect(diagnosticsBodyLimitBytes).toBe(128 * 1024);
  });

  it.each([
    ['screenshot', 'base64-image'],
    ['playerName', 'player'],
    ['steamId', '76561198000000000'],
    ['token', 'secret'],
    ['rawGsi', { player: { name: 'player' } }],
    ['frameHash', 'a'.repeat(64)],
  ])('rejects forbidden %s fields', (field, value) => {
    const input = batch();
    expect(() => diagnosticBatchInputSchema.parse({
      ...input,
      events: [{ ...input.events[0], [field]: value }],
    })).toThrow();
  });

  it('rejects unbounded batches, arbitrary event types, and raw error text', () => {
    expect(() => diagnosticBatchInputSchema.parse({
      ...batch(),
      events: Array.from({ length: diagnosticsBatchLimit + 1 }, (_, index) => event(index + 1)),
    })).toThrow();
    expect(() => diagnosticBatchInputSchema.parse({
      ...batch(),
      events: [{ ...event(), type: 'raw_log' }],
    })).toThrow();
    expect(() => diagnosticBatchInputSchema.parse({
      ...batch(),
      events: [{ ...event(), message: 'private stack trace' }],
    })).toThrow();
  });

  it('rejects duplicate event IDs and sequences inside one batch', () => {
    const first = event(1);
    expect(() => diagnosticBatchInputSchema.parse({
      ...batch(),
      events: [first, { ...event(2), id: first.id }],
    })).toThrow();
    expect(() => diagnosticBatchInputSchema.parse({
      ...batch(),
      events: [first, { ...event(2), sequence: first.sequence }],
    })).toThrow();
  });

  it('exposes only the sanitized admin event contract', () => {
    const parsed = diagnosticAdminEventSchema.parse({
      ...event(),
      details: event().details,
      accountEmail: 'private@example.com',
      ipAddress: '127.0.0.1',
    });
    expect(parsed).not.toHaveProperty('accountEmail');
    expect(parsed).not.toHaveProperty('ipAddress');
    expect(parsed.details).not.toHaveProperty('heroName');
  });
});
