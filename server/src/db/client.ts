import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type DatabasePoolConfig = {
  poolMax: number;
  poolMin: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
};

export type DatabasePoolMetrics = {
  maxConnections: number;
  totalConnections: number;
  idleConnections: number;
  waitingRequests: number;
};

const defaultPoolConfig: DatabasePoolConfig = {
  poolMax: 12,
  poolMin: 0,
  idleTimeoutMs: 30_000,
  connectionTimeoutMs: 5_000,
  statementTimeoutMs: 8_000,
};

export function createDatabase(
  databaseUrl: string,
  poolConfig: DatabasePoolConfig = defaultPoolConfig,
) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: poolConfig.poolMax,
    min: poolConfig.poolMin,
    idleTimeoutMillis: poolConfig.idleTimeoutMs,
    connectionTimeoutMillis: poolConfig.connectionTimeoutMs,
    statement_timeout: poolConfig.statementTimeoutMs,
    query_timeout: poolConfig.statementTimeoutMs + 1_000,
    idle_in_transaction_session_timeout: poolConfig.statementTimeoutMs,
    allowExitOnIdle: false,
  });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  const getPoolMetrics = (): DatabasePoolMetrics => ({
    maxConnections: poolConfig.poolMax,
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
  });
  return { db, pool, getPoolMetrics };
}

export type Database = ReturnType<typeof createDatabase>['db'];
