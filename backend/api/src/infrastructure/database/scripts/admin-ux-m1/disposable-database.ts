import { Pool, PoolConfig } from 'pg';

const DEFAULT_ALLOWED_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const DISPOSABLE_DATABASE_NAME = /(?:^|_)m1_qa(?:_[a-z0-9_]+)?$/i;
const FORBIDDEN_TARGET_TERM = /(^|[._-])(prod(?:uction)?|stage|staging|live)([._-]|$)/i;

export type DisposableDatabaseTarget = {
  connectionString: string;
  database: string;
  host: string;
  port: string;
};

function environmentValue(environment: NodeJS.ProcessEnv, key: string): string {
  return environment[key]?.trim() ?? '';
}

function normalizedHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function configuredAllowedHosts(environment: NodeJS.ProcessEnv): Set<string> {
  const configured = environmentValue(environment, 'ADMIN_UX_QA_ALLOWED_HOSTS');
  const hosts = new Set(DEFAULT_ALLOWED_HOSTS);

  for (const host of configured.split(',')) {
    if (host.trim() !== '') {
      hosts.add(normalizedHost(host));
    }
  }

  return hosts;
}

function hasForbiddenTargetTerm(value: string): boolean {
  return FORBIDDEN_TARGET_TERM.test(value);
}

function databaseNameFromUrl(url: URL): string {
  const database = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (database === '' || database.includes('/')) {
    throw new Error('DATABASE_URL must identify exactly one disposable database');
  }
  return database;
}

/**
 * Validates a database target before an M1 command opens a mutative connection.
 *
 * This intentionally does not accept the application's DB_HOST/DB_NAME fallback:
 * M1 commands must always receive one explicit DATABASE_URL and an affirmative
 * disposable marker. A CI service hostname may be added only with the explicit
 * ADMIN_UX_QA_ALLOWED_HOSTS allowlist.
 */
export function disposableDatabaseTargetFromEnv(
  environment: NodeJS.ProcessEnv = process.env,
): DisposableDatabaseTarget {
  const databaseUrl = environmentValue(environment, 'DATABASE_URL');
  if (databaseUrl === '') {
    throw new Error('DATABASE_URL is required for Admin UX M1 database commands');
  }
  if (environmentValue(environment, 'ADMIN_UX_QA_DISPOSABLE') !== 'true') {
    throw new Error('ADMIN_UX_QA_DISPOSABLE=true is required for Admin UX M1 database commands');
  }

  const nodeEnvironment = environmentValue(environment, 'NODE_ENV').toLowerCase();
  if (nodeEnvironment === 'production' || nodeEnvironment === 'staging') {
    throw new Error('Admin UX M1 database commands refuse NODE_ENV production or staging');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres or postgresql scheme');
  }

  const host = normalizedHost(parsed.hostname);
  const database = databaseNameFromUrl(parsed);
  if (host === '') {
    throw new Error('DATABASE_URL must include a database host');
  }
  if (hasForbiddenTargetTerm(host) || hasForbiddenTargetTerm(database)) {
    throw new Error('Admin UX M1 database commands refuse production or staging-like targets');
  }
  if (!DISPOSABLE_DATABASE_NAME.test(database)) {
    throw new Error('DATABASE_URL database name must end in _m1_qa (or _m1_qa_<suffix>)');
  }
  if (!configuredAllowedHosts(environment).has(host)) {
    throw new Error('DATABASE_URL host is not an approved disposable host');
  }

  return {
    connectionString: databaseUrl,
    database,
    host,
    port: parsed.port || '5432',
  };
}

export function disposableDatabasePoolConfig(
  target: DisposableDatabaseTarget,
  environment: NodeJS.ProcessEnv = process.env,
): PoolConfig {
  return {
    connectionString: target.connectionString,
    ssl: environmentValue(environment, 'DB_SSL') === 'true' ? { rejectUnauthorized: true } : undefined,
  };
}

export function sanitizedDisposableTarget(target: DisposableDatabaseTarget): Record<string, string> {
  return {
    database: target.database,
    host: target.host,
    port: target.port,
  };
}

/**
 * Confirms that PostgreSQL resolved the same database name that the guard
 * validated. Call this before running migrations or inserting test fixtures.
 */
export async function assertDisposableDatabaseConnection(
  pool: Pool,
  target: DisposableDatabaseTarget,
): Promise<void> {
  const result = await pool.query<{ current_database: string }>(
    'SELECT current_database() AS current_database',
  );
  const connectedDatabase = result.rows[0]?.current_database;
  if (connectedDatabase !== target.database) {
    throw new Error('Connected database does not match the guarded disposable database');
  }
}
