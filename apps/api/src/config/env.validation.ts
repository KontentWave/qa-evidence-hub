import { isIP } from 'node:net';

export type NodeEnv = 'development' | 'test' | 'production';

export interface DisabledTrustProxyConfig {
  readonly mode: 'disabled';
}

export interface AllowlistTrustProxyConfig {
  readonly mode: 'allowlist';
  readonly cidrs: readonly string[];
  readonly hostnames: readonly string[];
}

export type TrustProxySetting = DisabledTrustProxyConfig | AllowlistTrustProxyConfig;

export interface ApiEnv {
  readonly nodeEnv: NodeEnv;
  readonly apiPort: number;
  readonly appOrigin: string;
  readonly databaseUrl: string;
  readonly databasePoolMax: number;
  readonly postgresMaxConnections: number;
  readonly databaseStatementTimeoutMs: number;
  readonly trustProxy: TrustProxySetting;
  readonly sessionTtlSeconds: number;
  readonly loginMaxAttempts: number;
  readonly loginWindowSeconds: number;
  readonly loginBlockSeconds: number;
  readonly loginThrottleMaxKeys: number;
  readonly passwordScryptLn: number;
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

const FORBIDDEN_BROAD_PROXY_TOKENS = new Set([
  'true',
  '*',
  '0.0.0.0/0',
  '::/0',
  '0/0',
  'uniquelocal',
  'linklocal',
]);

const HOSTNAME_LABEL_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

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

function normalizeExplicitIpOrCidr(token: string): string | null {
  if (FORBIDDEN_BROAD_PROXY_TOKENS.has(token.toLowerCase())) {
    return null;
  }
  const slashIndex = token.indexOf('/');
  if (slashIndex === -1) {
    const version = isIP(token);
    if (version === 4) {
      return `${token}/32`;
    }
    if (version === 6) {
      return `${token}/128`;
    }
    return null;
  }

  const address = token.slice(0, slashIndex);
  const prefixRaw = token.slice(slashIndex + 1);
  const ipVersion = isIP(address);
  if (ipVersion === 0 || !/^\d+$/.test(prefixRaw)) {
    return null;
  }
  const prefix = Number.parseInt(prefixRaw, 10);
  if (ipVersion === 4 && prefix >= 8 && prefix <= 32) {
    return `${address}/${prefix}`;
  }
  if (ipVersion === 6 && prefix >= 16 && prefix <= 128) {
    return `${address}/${prefix}`;
  }
  return null;
}

function isExplicitProxyHostname(tokenLower: string): boolean {
  if (FORBIDDEN_BROAD_PROXY_TOKENS.has(tokenLower) || tokenLower === 'false') {
    return false;
  }
  if (/^\d+$/.test(tokenLower) || tokenLower.includes('/')) {
    return false;
  }
  if (tokenLower.length > 253) {
    return false;
  }
  return HOSTNAME_LABEL_REGEX.test(tokenLower);
}

function parseTrustProxy(raw: string | undefined, issues: string[]): TrustProxySetting {
  if (raw === undefined || raw.trim() === '') {
    return { mode: 'disabled' };
  }
  const normalized = raw.trim();
  const lower = normalized.toLowerCase();

  if (lower === 'false' || lower === '0') {
    return { mode: 'disabled' };
  }

  if (FORBIDDEN_BROAD_PROXY_TOKENS.has(lower) || /^\d+$/.test(lower)) {
    issues.push(
      'TRUST_PROXY must restrict forwarded headers to the configured Nginx ingress ("false", "loopback", explicit IP/CIDR, or explicit proxy service hostname; wildcard, hop-count, and broad private ranges are forbidden)',
    );
    return { mode: 'disabled' };
  }

  const tokens = normalized
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (tokens.length === 0) {
    return { mode: 'disabled' };
  }

  const cidrs: string[] = [];
  const hostnames: string[] = [];

  for (const token of tokens) {
    const tokenLower = token.toLowerCase();
    if (tokenLower === 'loopback') {
      cidrs.push('127.0.0.0/8', '::1/128');
      continue;
    }

    const explicitCidr = normalizeExplicitIpOrCidr(token);
    if (explicitCidr) {
      cidrs.push(explicitCidr);
      continue;
    }

    if (isExplicitProxyHostname(tokenLower)) {
      hostnames.push(tokenLower);
      continue;
    }

    issues.push(
      'TRUST_PROXY contains an invalid or overly broad proxy entry; specify "false", "loopback", explicit IP/CIDR, or explicit Nginx ingress hostname',
    );
    return { mode: 'disabled' };
  }

  return {
    mode: 'allowlist',
    cidrs: [...new Set(cidrs)],
    hostnames: [...new Set(hostnames)],
  };
}

function validateAppOrigin(
  raw: string | undefined,
  nodeEnv: NodeEnv,
  issues: string[],
): string {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    if (nodeEnv === 'production') {
      issues.push('APP_ORIGIN is required in production');
      return '';
    }
    return 'http://127.0.0.1:8080';
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    issues.push('APP_ORIGIN must be a valid exact HTTP or HTTPS origin');
    return '';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    issues.push('APP_ORIGIN must use http:// or https:// scheme');
    return '';
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    trimmed.endsWith('/')
  ) {
    issues.push(
      'APP_ORIGIN must be an exact bare origin (scheme://host[:port]) with no path, trailing slash, credentials, query, or hash',
    );
    return '';
  }

  if (
    nodeEnv === 'production' &&
    parsed.protocol === 'http:' &&
    !LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())
  ) {
    issues.push('APP_ORIGIN must use https:// in production for non-loopback hosts');
    return '';
  }

  return parsed.origin;
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
  const nodeEnv: NodeEnv =
    rawNodeEnv === 'production' || rawNodeEnv === 'test' ? rawNodeEnv : 'development';

  const apiPort = parseBoundedInt(rawEnv.API_PORT, 3001, 'API_PORT', 1, 65535, issues);
  const appOrigin = validateAppOrigin(rawEnv.APP_ORIGIN, nodeEnv, issues);
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

  const sessionTtlSeconds = parseBoundedInt(
    rawEnv.AUTH_SESSION_TTL_SECONDS,
    43_200,
    'AUTH_SESSION_TTL_SECONDS',
    60,
    604_800,
    issues,
  );
  const loginMaxAttempts = parseBoundedInt(
    rawEnv.AUTH_LOGIN_MAX_ATTEMPTS,
    5,
    'AUTH_LOGIN_MAX_ATTEMPTS',
    1,
    50,
    issues,
  );
  const loginWindowSeconds = parseBoundedInt(
    rawEnv.AUTH_LOGIN_WINDOW_SECONDS,
    900,
    'AUTH_LOGIN_WINDOW_SECONDS',
    1,
    86_400,
    issues,
  );
  const loginBlockSeconds = parseBoundedInt(
    rawEnv.AUTH_LOGIN_BLOCK_SECONDS,
    900,
    'AUTH_LOGIN_BLOCK_SECONDS',
    1,
    86_400,
    issues,
  );
  const loginThrottleMaxKeys = parseBoundedInt(
    rawEnv.AUTH_THROTTLE_MAX_KEYS,
    4096,
    'AUTH_THROTTLE_MAX_KEYS',
    16,
    65_536,
    issues,
  );
  const passwordScryptLn = parseBoundedInt(
    rawEnv.AUTH_PASSWORD_SCRYPT_LN,
    16,
    'AUTH_PASSWORD_SCRYPT_LN',
    14,
    18,
    issues,
  );

  if (issues.length > 0) {
    throw new EnvValidationError(issues);
  }

  return {
    nodeEnv,
    apiPort,
    appOrigin,
    databaseUrl,
    databasePoolMax,
    postgresMaxConnections,
    databaseStatementTimeoutMs,
    trustProxy,
    sessionTtlSeconds,
    loginMaxAttempts,
    loginWindowSeconds,
    loginBlockSeconds,
    loginThrottleMaxKeys,
    passwordScryptLn,
  };
}
