import dotenv from 'dotenv';
import type { PoolConfig } from 'mariadb';

dotenv.config();

/**
 * URL para Prisma CLI (migrate) y runtime. Si la contraseña tiene `/`, `@`, etc.,
 * un DATABASE_URL plano falla al parsear; armar desde DB_* con encodeURIComponent evita P1013.
 */
export function getMysqlUrlFromEnv(): string {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? '3306';
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASS;
  const name = process.env.DB_NAME;

  if (host && name && user !== undefined && pass !== undefined) {
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(pass);
    return `mysql://${u}:${p}@${host}:${port}/${name}`;
  }

  const direct = process.env.DATABASE_URL;
  if (direct) {
    return direct;
  }

  throw new Error(
    'Define DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME o DATABASE_URL para la base de datos.'
  );
}

function parseMysqlUrl(url: string): Pick<
  PoolConfig,
  'host' | 'port' | 'user' | 'password' | 'database'
> {
  try {
    const u = new URL(url);
    const dbPath = u.pathname.replace(/^\//, '').split('?')[0] ?? '';
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: dbPath,
    };
  } catch {
    throw new Error(
      `DATABASE_URL inválida. Formato esperado: mysql://user:password@host:3306/database`
    );
  }
}

function getConnectionParams(): Pick<
  PoolConfig,
  'host' | 'port' | 'user' | 'password' | 'database'
> {
  const host = process.env.DB_HOST;
  const name = process.env.DB_NAME;

  if (host && name && process.env.DB_USER !== undefined && process.env.DB_PASS !== undefined) {
    return {
      host,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: name,
    };
  }

  return parseMysqlUrl(getMysqlUrlFromEnv());
}

/**
 * Config del pool mariadb para @prisma/adapter-mariadb.
 * Defaults pensados para hosting compartido (límite max_connections_per_hour):
 * poco paralelismo, reutilizar conexiones (idleTimeout), fallar antes si el servidor corta.
 */
export function getDbPoolLimit(): number {
  const n = parseInt(process.env.DB_POOL_LIMIT ?? '5', 10);
  return Number.isFinite(n) && n >= 1 ? n : 5;
}

/** Concurrencia máxima de escrituras paralelas a BD (dejar 1 conexión libre para HTTP). */
export function getDbWriteConcurrency(): number {
  const override = process.env.DB_WRITE_CONCURRENCY;
  if (override) {
    const n = parseInt(override, 10);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return Math.max(1, getDbPoolLimit() - 1);
}

export function getMariaPoolConfig(): PoolConfig {
  const base = getConnectionParams();

  const connectionLimit = getDbPoolLimit();
  const acquireTimeout = parseInt(process.env.DB_ACQUIRE_TIMEOUT ?? '30000', 10);
  const connectTimeout = parseInt(process.env.DB_CONNECT_TIMEOUT ?? '15000', 10);
  /** Segundos; el driver mariadb usa segundos para idle del pool (default 1800). */
  const idleTimeout = parseInt(process.env.DB_POOL_IDLE_TIMEOUT_SEC ?? '1800', 10);

  return {
    ...base,
    connectionLimit,
    acquireTimeout,
    connectTimeout,
    idleTimeout,
    allowPublicKeyRetrieval: true,
  };
}
