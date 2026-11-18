import { isIP } from 'node:net';

export type NodeEnv = 'development' | 'test' | 'production';
export type TrustProxySetting = boolean | number | string[];

export interface ApiEnv {
  readonly nodeEnv: NodeEnv;
  readonly apiPort: number;
  readonly databaseUrl: string;
  readonly databasePoolMax: number;
  readonly postgresMaxConnections: number;
  readonly databaseStatementTimeoutMs: number;
  readonly trustProxy: TrustProxySetting;
}

export const API_ENV = Symbol('API_ENV');

export class EnvValidationError extends Error {
  public readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid API environment configuration: ${issues.join('; ')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

const NAMED_PROXY_SUBNETS = new Set(['loopback', 'linklocal', 'uniquelocal']);
const FORBIDDEN_WILDCARD_PROXIES = new Set(['true', '*', '0.0.0.0/0', '::/0', '0/0']);

function parseBoundedInt(
  raw: string | undefined,
  defaultValue: number,
  name: string,
  min: number,
  max: number,
  issues: string[],
): number {
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    issues.push(`${name} must be an integer between ${min} and ${max}`);
    return defaultValue;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    issues.push(`${name} must be between ${min} and ${max}`);
    return defaultValue;
  }
  return parsed;
}

function isExplicitIpOrCidr(token: string): boolean {
  if (FORBIDDEN_WILDCARD_PROXIES.has(token.toLowerCase())) {
    return false;
  }
  const slashIndex = token.indexOf('/');
  if (slashIndex === -1) {
    return isIP(token) !== 0;
  }
  const address = token.slice(0, slashIndex);
  const prefixRaw = token.slice(slashIndex + 1);
  const ipVersion = isIP(address);
  if (ipVersion === 0 || !/^\d+$/.test(prefixRaw)) {
    return false;
  }
  const prefix = Number.parseInt(prefixRaw, 10);
  if (ipVersion === 4) {
    return prefix >= 8 && prefix <= 32;
  }
  return prefix >= 16 && prefix <= 128;
}

function parseTrustProxy(raw: string | undefined, issues: string[]): TrustProxySetting {
  if (raw === undefined || raw.trim() === '') {
    return false;
  }
  const normalized = raw.trim();
  const lower = normalized.toLowerCase();

  if (lower === 'false' || lower === '0') {
    return false;
  }
  if (FORBIDDEN_WILDCARD_PROXIES.has(lower)) {
    issues.push(
      'TRUST_PROXY must not use unbounded wildcard trust ("true" or /0 CIDR); specify "false", hop count 1..5, or explicit subnet/address',
    );
    return false;
  }
  if (/^\d+$/.test(normalized)) {
    const hops = Number.parseInt(normalized, 10);
    if (hops < 1 || hops > 5) {
      issues.push('TRUST_PROXY hop count must be between 1 and 5');
      return false;
    }
    return hops;
  }

  const tokens = normalized
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (tokens.length === 0) {
    return false;
  }

  for (const token of tokens) {
    const tokenLower = token.toLowerCase();
    if (!NAMED_PROXY_SUBNETS.has(tokenLower) && !isExplicitIpOrCidr(token)) {
      issues.push(
        'TRUST_PROXY contains an invalid or overly broad proxy entry; use loopback/linklocal/uniquelocal, hop count 1..5, or explicit CIDR',
      );
      return false;
    }
  }

  return tokens;
}

function validateDatabaseUrl(raw: string | undefined, issues: string[]): string {
  if (!raw || raw.trim() === '') {
    issues.push('DATABASE_URL is required');
    return '';
  }

  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    issues.push('DATABASE_URL must be a valid PostgreSQL connection URI');
    return '';
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    issues.push('DATABASE_URL must use postgresql:// or postgres:// scheme');
    return '';
  }

  const dbName = parsed.pathname.replace(/^\/+/, '');
  if (!parsed.hostname || !dbName) {
    issues.push('DATABASE_URL must include both a hostname and database name');
    return '';
  }

  if (parsed.port !== '') {
    const port = Number.parseInt(parsed.port, 10);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
      issues.push('DATABASE_URL port must be between 1 and 65535');
      return '';
    }
  }

  return trimmed;
}

export function validateApiEnv(rawEnv: Record<string, string | undefined>): ApiEnv {
  const issues: string[] = [];

  const rawNodeEnv = rawEnv.NODE_ENV?.trim() || 'development';
  if (rawNodeEnv !== 'development' && rawNodeEnv !== 'test' && rawNodeEnv !== 'production') {
    issues.push('NODE_ENV must be one of development, test, or production');
  }

  const apiPort = parseBoundedInt(rawEnv.API_PORT, 3001, 'API_PORT', 1, 65535, issues);
  const databaseUrl = validateDatabaseUrl(rawEnv.DATABASE_URL, issues);
  const postgresMaxConnections = parseBoundedInt(
    rawEnv.POSTGRES_MAX_CONNECTIONS,
    30,
    'POSTGRES_MAX_CONNECTIONS',
    5,
    500,
    issues,
  );
  const databasePoolMax = parseBoundedInt(
    rawEnv.DATABASE_POOL_MAX,
    10,
    'DATABASE_POOL_MAX',
    1,
    100,
    issues,
  );

  if (databasePoolMax >= postgresMaxConnections) {
    issues.push(
      `DATABASE_POOL_MAX (${databasePoolMax}) must be strictly below POSTGRES_MAX_CONNECTIONS (${postgresMaxConnections})`,
    );
  }

  const databaseStatementTimeoutMs = parseBoundedInt(
    rawEnv.DATABASE_STATEMENT_TIMEOUT_MS,
    5000,
    'DATABASE_STATEMENT_TIMEOUT_MS',
    500,
    30_000,
    issues,
  );

  const trustProxy = parseTrustProxy(rawEnv.TRUST_PROXY, issues);

  if (issues.length > 0) {
    throw new EnvValidationError(issues);
  }

  return {
    nodeEnv: rawNodeEnv as NodeEnv,
    apiPort,
    databaseUrl,
    databasePoolMax,
    postgresMaxConnections,
    databaseStatementTimeoutMs,
    trustProxy,
  };
}
