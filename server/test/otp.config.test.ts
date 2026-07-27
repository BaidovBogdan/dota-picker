import { describe, expect, it } from 'vitest';
import { loadConfig, loadMigrationConfig } from '../src/config/env.js';

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

  it('allows an explicitly enabled static OTP during a production pre-launch', () => {
    const config = loadConfig({
      ...base,
      NODE_ENV: 'production',
      OTP_STATIC_CODE: '1234',
      ALLOW_STATIC_OTP_IN_PRODUCTION: 'true',
    });

    expect(config.otp.staticCode).toBe('1234');
  });

  it('uses a direct migration URL when one is configured', () => {
    const migrationDatabaseUrl = 'postgresql://dota_picker:dota_picker@direct.example.com/dota_picker';
    const config = loadMigrationConfig({
      ...base,
      MIGRATION_DATABASE_URL: migrationDatabaseUrl,
    });

    expect(config.databaseUrl).toBe(migrationDatabaseUrl);
    expect(loadMigrationConfig(base).databaseUrl).toBe(base.DATABASE_URL);
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
