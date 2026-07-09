import { Pool } from "pg";

let legacyPool: Pool | null = null;

function readLegacyEnv(name: string) {
  return process.env[`LEGACY_${name}`] || process.env[`OLD_${name}`] || "";
}

export function getLegacyPool() {
  if (legacyPool) return legacyPool;

  const host = readLegacyEnv("DB_HOST").trim();
  const database = readLegacyEnv("DB_NAME").trim();
  const user = readLegacyEnv("DB_USER").trim();
  const password = readLegacyEnv("DB_PASS") || process.env.LEGACY_DB_PASSWORD || process.env.OLD_DB_PASSWORD || "";
  const port = Number.parseInt(readLegacyEnv("DB_PORT") || "5432", 10);

  if (!host || !database || !user) {
    throw new Error("Legacy DB is not configured. Set LEGACY_DB_HOST, LEGACY_DB_NAME, and LEGACY_DB_USER.");
  }

  legacyPool = new Pool({
    host,
    database,
    user,
    password,
    port,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    query_timeout: 30000,
    statement_timeout: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  return legacyPool;
}
