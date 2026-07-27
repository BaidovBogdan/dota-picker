import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

const base = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://dota_picker:dota_picker@localhost:5432/dota_picker',
  JWT_SECRET: 'test-jwt-secret-that-is-longer-than-32-characters',
  REVENUECAT_WEBHOOK_SECRET: 'test-revenuecat-secret-long-enough',
};

describe('Gemini configuration', () => {
  it('uses a server-supported recommendation deadline by default', () => {
    expect(loadConfig(base).gemini.recommendationTimeoutMs).toBe(15_000);
  });

  it('rejects recommendation deadlines below the Gemini minimum', () => {
    expect(() => loadConfig({
      ...base,
      GEMINI_RECOMMENDATION_TIMEOUT_MS: '9999',
    })).toThrow();
  });
});
