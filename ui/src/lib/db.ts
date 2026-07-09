import { Pool } from 'pg';

const DB_POOL_MAX = 8;
const DB_IDLE_TIMEOUT_MS = 30000;
const DB_CONNECTION_TIMEOUT_MS = 15000;
const DB_QUERY_TIMEOUT_MS = 30000;
const DB_STATEMENT_TIMEOUT_MS = 30000;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'nadaraya',
  password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT || '5432'),
  max: DB_POOL_MAX,
  idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
  query_timeout: DB_QUERY_TIMEOUT_MS,
  statement_timeout: DB_STATEMENT_TIMEOUT_MS,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

export const oldPool = new Pool({
  host: process.env.OLD_DB_HOST || process.env.DB_HOST || 'localhost',
  database: process.env.OLD_DB_NAME || 'postgres',
  user: process.env.OLD_DB_USER || 'nadaraya',
  password: process.env.OLD_DB_PASS || process.env.OLD_DB_PASSWORD || '',
  port: parseInt(process.env.OLD_DB_PORT || '5432'),
  max: DB_POOL_MAX,
  idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
  query_timeout: DB_QUERY_TIMEOUT_MS,
  statement_timeout: DB_STATEMENT_TIMEOUT_MS,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

export default pool;
