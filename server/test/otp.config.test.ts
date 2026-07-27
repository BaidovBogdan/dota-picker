import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

const base = {
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://dota_picker:dota_picker@localhost:5432/dota_picker',
  JWT_SECRET: 'test-jwt-secret-that-is-longer-than-32-characters',
  REVENUECAT_WEBHOOK_SECRET: 'test-revenuecat-secret-long-enough',
};

describe('OTP configuration', () => {
  it('uses code 1234 only outside production by default', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'development' }).otp.staticCode).toBe('1234');
    expect(loadConfig({ ...base, NODE_ENV: 'test' }).otp.staticCode).toBe('1234');
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).otp.staticCode).toBeUndefined();
  });

  it('rejects a static OTP bypass in production', () => {
    expect(() => loadConfig({
      ...base,
      NODE_ENV: 'production',
      OTP_STATIC_CODE: '1234',
    })).toThrow();
  });

  it.each(['123', '12345', '12345678'])(
    'rejects a static OTP code with an invalid length: %s',
    (staticCode) => {
      expect(() => loadConfig({
        ...base,
        NODE_ENV: 'development',
        OTP_STATIC_CODE: staticCode,
      })).toThrow();
    },
  );
});
