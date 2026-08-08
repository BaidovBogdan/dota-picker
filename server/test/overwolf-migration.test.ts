import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Overwolf analysis migration', () => {
  it('adds the source enum value and a non-null revision counter', async () => {
    const migrationUrl = new URL('../src/db/migrations/0006_dashing_thanos.sql', import.meta.url);
    const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(sql).toContain('ALTER TYPE "public"."analysis_source" ADD VALUE \'overwolf\'');
    expect(sql).toContain('ADD COLUMN "revision" integer DEFAULT 0 NOT NULL');
  });
});
