import { describe, expect, it } from 'vitest';
import { EnvValidationError, validateApiEnv } from './env.validation';

describe('validateApiEnv', () => {
  const validBaseEnv = {
    NODE_ENV: 'production',
    API_PORT: '3001',
    APP_ORIGIN: 'https://hub.synthetic.invalid',
    DATABASE_URL: 'postgresql://qaeh_user:top_secret_pw_123@postgres-internal:5432/qaeh_db?schema=public',
    DATABASE_POOL_MAX: '10',
    POSTGRES_MAX_CONNECTIONS: '30',
    DATABASE_STATEMENT_TIMEOUT_MS: '5000',
    TRUST_PROXY: 'nginx',
  };

  it('parses valid API environment settings with bounded pool, exact origin, and explicit Nginx proxy trust', () => {
    const parsed = validateApiEnv(validBaseEnv);

    expect(parsed.nodeEnv).toBe('production');
    expect(parsed.apiPort).toBe(3001);
    expect(parsed.appOrigin).toBe('https://hub.synthetic.invalid');
    expect(parsed.databasePoolMax).toBe(10);
    expect(parsed.postgresMaxConnections).toBe(30);
    expect(parsed.databaseStatementTimeoutMs).toBe(5000);
    expect(parsed.trustProxy).toEqual({
      mode: 'allowlist',
      cidrs: [],
      hostnames: ['nginx'],
    });
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

  it('rejects wildcard, numeric hop-count, or broad private TRUST_PROXY values', () => {
    for (const forbidden of ['true', '0.0.0.0/0', '1', 'uniquelocal', 'linklocal']) {
      expect(() =>
        validateApiEnv({
          ...validBaseEnv,
          TRUST_PROXY: forbidden,
        }),
      ).toThrow(/TRUST_PROXY/);
    }
  });

  it('accepts false, loopback, explicit CIDR, or explicit Nginx ingress hostname', () => {
    expect(
      validateApiEnv({
        ...validBaseEnv,
        TRUST_PROXY: 'false',
      }).trustProxy,
    ).toEqual({ mode: 'disabled' });

    expect(
      validateApiEnv({
        ...validBaseEnv,
        TRUST_PROXY: 'loopback, 192.0.2.10/32, nginx',
      }).trustProxy,
    ).toEqual({
      mode: 'allowlist',
      cidrs: ['127.0.0.0/8', '::1/128', '192.0.2.10/32'],
      hostnames: ['nginx'],
    });
  });

  it('requires exact HTTPS APP_ORIGIN in production for non-loopback hosts and rejects paths/queries/trailing slashes', () => {
    expect(() =>
      validateApiEnv({
        ...validBaseEnv,
        APP_ORIGIN: undefined,
      }),
    ).toThrow(/APP_ORIGIN/);

    expect(() =>
      validateApiEnv({
        ...validBaseEnv,
        APP_ORIGIN: 'http://hub.synthetic.invalid',
      }),
    ).toThrow(/APP_ORIGIN/);

    expect(() =>
      validateApiEnv({
        ...validBaseEnv,
        APP_ORIGIN: 'https://hub.synthetic.invalid/',
      }),
    ).toThrow(/APP_ORIGIN/);

    expect(() =>
      validateApiEnv({
        ...validBaseEnv,
        APP_ORIGIN: 'https://hub.synthetic.invalid/app',
      }),
    ).toThrow(/APP_ORIGIN/);

    expect(
      validateApiEnv({
        ...validBaseEnv,
        APP_ORIGIN: 'http://127.0.0.1:8080',
      }).appOrigin,
    ).toBe('http://127.0.0.1:8080');
  });

  it('defaults AUTH_PASSWORD_SCRYPT_LN to 16, accepts 14-16, and rejects 17 and 18 with a clear configuration error', () => {
    expect(validateApiEnv(validBaseEnv).passwordScryptLn).toBe(16);

    for (const allowed of ['14', '15', '16']) {
      expect(
        validateApiEnv({
          ...validBaseEnv,
          AUTH_PASSWORD_SCRYPT_LN: allowed,
        }).passwordScryptLn,
      ).toBe(Number(allowed));
    }

    for (const rejected of ['13', '17', '18']) {
      let caught: unknown;
      try {
        validateApiEnv({
          ...validBaseEnv,
          AUTH_PASSWORD_SCRYPT_LN: rejected,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(EnvValidationError);
      expect((caught as Error).message).toMatch(/AUTH_PASSWORD_SCRYPT_LN.*14.*16/);
    }
  });
});
