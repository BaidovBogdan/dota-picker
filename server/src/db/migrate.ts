import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config/env.js';
import { createDatabase } from './client.js';

const config = loadConfig();
const { db, pool } = createDatabase(config.databaseUrl);

try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)) });
} finally {
  await pool.end();
}
