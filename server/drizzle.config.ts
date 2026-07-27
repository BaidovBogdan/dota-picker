import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL
      ?? process.env.DATABASE_URL
      ?? 'postgresql://dota_picker:dota_picker@localhost:5432/dota_picker',
  },
  strict: true,
  verbose: true,
});
