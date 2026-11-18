import { describe, expect, it } from 'vitest';
import { EnvValidationError, validateApiEnv } from './env.validation';

describe('validateApiEnv', () => {
  const validBaseEnv = {
    NODE_ENV: 'production',
    API_PORT: '3001',
    DATABASE_URL: 'postgresql://qaeh_user:top_secret_pw_123@postgres-internal:5432/qaeh_db?schema=public',
    DATABASE_POOL_MAX: '10',
    POSTGRES_MAX_CONNECTIONS: '30',
    DATABASE_STATEMENT_TIMEOUT_MS: '5000',
    TRUST_PROXY: '1',
  };

  it('parses valid API environment settings with bounded pool and explicit proxy trust', () => {
    const parsed = validateApiEnv(validBaseEnv);

    expect(parsed.nodeEnv).toBe('production');
    expect(parsed.apiPort).toBe(3001);
    expect(parsed.databasePoolMax).toBe(10);
    expect(parsed.postgresMaxConnections).toBe(30);
    expect(parsed.databaseStatementTimeoutMs).toBe(5000);
    expect(parsed.trustProxy).toBe(1);
  });

  it('rejects missing DATABASE_URL', () => {
    expect(() =>
      validateApiEnv({
        ...validBaseEnv,
        DATABASE_URL: undefined,
      }),
    ).toThrow(EnvValidationError);
  });

  it('rejects malformed or non-PostgreSQL DATABASE_URL without echoing credentials, hostnames, or raw input', () => {
    const secretMarker = 'super_secret_password_998877';
    const internalHost = 'db-private-cluster.internal';
    const badDsn = `mysql://admin:${secretMarker}@${internalHost}:3306/qaeh`;

    let caught: unknown;
    try {
      validateApiEnv({
        ...validBaseEnv,
        DATABASE_URL: badDsn,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    const message = (caught as Error).message;
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain(secretMarker);
    expect(message).not.toContain(internalHost);
    expect(message).not.toContain('mysql://');
  });

  it('rejects DATABASE_POOL_MAX when equal to or above POSTGRES_MAX_CONNECTIONS', () => {
    expect(() =>
      validateApiEnv({
        ...validBaseEnv,
        DATABASE_POOL_MAX: '30',
        POSTGRES_MAX_CONNECTIONS: '30',
      }),
    ).toThrow(/DATABASE_POOL_MAX/);
  });

  it('rejects unbounded wildcard TRUST_PROXY values such as true or 0.0.0.0/0', () => {
    expect(() =>
      validateApiEnv({
        ...validBaseEnv,
        TRUST_PROXY: 'true',
      }),
    ).toThrow(/TRUST_PROXY/);

    expect(() =>
      validateApiEnv({
        ...validBaseEnv,
        TRUST_PROXY: '0.0.0.0/0',
      }),
    ).toThrow(/TRUST_PROXY/);
  });

  it('accepts false or explicit subnet/named proxy trust', () => {
    expect(
      validateApiEnv({
        ...validBaseEnv,
        TRUST_PROXY: 'false',
      }).trustProxy,
    ).toBe(false);

    expect(
      validateApiEnv({
        ...validBaseEnv,
        TRUST_PROXY: 'loopback, uniquelocal',
      }).trustProxy,
    ).toEqual(['loopback', 'uniquelocal']);
  });
});
