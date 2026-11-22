import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { LoginThrottledException } from '../common/http-exception.filter';
import { validateApiEnv } from '../config/env.validation';
import type { PrismaService } from '../prisma/prisma.service';
import {
  type AuthenticatedActor,
  type AuthenticatedRequest,
  extractActorFromContext,
  IS_HEALTH_PUBLIC_ROUTE_KEY,
  IS_PRELOGIN_CSRF_ROUTE_KEY,
  IS_PUBLIC_ROUTE_KEY,
  PreLoginCsrfRoute,
  Public,
  PublicHealth,
} from './auth.decorators';
import { AuthAndCsrfGuard } from './auth.guard';
import { AuthService, hashSessionTokenDigest } from './auth.service';
import {
  CSRF_HEADER_NAME,
  CsrfService,
  PRELOGIN_CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from './csrf.service';
import { LoginThrottlerService } from './login-throttler.service';
import { PasswordHasherService } from './password-hasher.service';

const baseTestEnv = validateApiEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://qaeh:synthetic@localhost:5432/qaeh',
  TRUST_PROXY: 'false',
  APP_ORIGIN: 'https://hub.synthetic.invalid',
  AUTH_PASSWORD_SCRYPT_LN: '14',
  AUTH_LOGIN_MAX_ATTEMPTS: '3',
  AUTH_LOGIN_WINDOW_SECONDS: '60',
  AUTH_LOGIN_BLOCK_SECONDS: '120',
  AUTH_THROTTLE_MAX_KEYS: '16',
});

describe('PasswordHasherService', () => {
  it('hashes with salted scrypt PHC format, verifies bounded concurrency, and rejects malformed or out-of-range hashes', async () => {
    const hasher = new PasswordHasherService(baseTestEnv);

    const parallelHashes = await Promise.all(
      Array.from({ length: 6 }, (_, idx) => hasher.hashPassword(`SyntheticSecret!2026#${idx}`)),
    );
    expect(new Set(parallelHashes).size).toBe(6);

    const hash0 = parallelHashes[0]!;
    expect(await hasher.verifyPassword('SyntheticSecret!2026#0', hash0)).toBe(true);
    expect(await hasher.verifyPassword('WrongSecret!2026#0', hash0)).toBe(false);
    expect(await hasher.verifyPassword('', hash0)).toBe(false);
    expect(await hasher.verifyPassword('a'.repeat(1025), hash0)).toBe(false);

    await expect(hasher.hashPassword('')).rejects.toThrow(/outside permitted bounds/);
    await expect(hasher.hashPassword('x'.repeat(1025))).rejects.toThrow(/outside permitted bounds/);

    // Malformed PHC strings and excessive/unsafe parameters fail closed without throwing.
    expect(await hasher.verifyPassword('ValidPass!123456', 'not-a-phc-hash')).toBe(false);
    for (const disallowedLn of [13, 17, 18, 22]) {
      expect(
        await hasher.verifyPassword(
          'ValidPass!123456',
          `$scrypt$ln=${disallowedLn},r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA$${'A'.repeat(86)}`,
        ),
      ).toBe(false);
    }
    expect(
      await hasher.verifyPassword(
        'ValidPass!123456',
        `$scrypt$ln=16,r=16,p=1$AAAAAAAAAAAAAAAAAAAAAA$${'A'.repeat(86)}`,
      ),
    ).toBe(false);
    expect(
      await hasher.verifyPassword(
        'ValidPass!123456',
        '$scrypt$ln=14,r=8,p=1$c2hvcnQ$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ),
    ).toBe(false);

    // Accepted upper bound ln=16 hashes and verifies cleanly within the 128 MiB limit,
    // and existing CLI-provisioned ln=16 hashes verify using stored parameters even when defaultLn=14.
    const upperBoundEnv = validateApiEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://qaeh:synthetic@localhost:5432/qaeh',
      TRUST_PROXY: 'false',
      AUTH_PASSWORD_SCRYPT_LN: '16',
    });
    const upperBoundHasher = new PasswordHasherService(upperBoundEnv);
    const cliLikeHashLn16 = await upperBoundHasher.hashPassword('UpperBoundPass!2026#16');
    expect(cliLikeHashLn16).toMatch(/^\$scrypt\$ln=16,r=8,p=1\$/);
    expect(await upperBoundHasher.verifyPassword('UpperBoundPass!2026#16', cliLikeHashLn16)).toBe(
      true,
    );
    expect(await hasher.verifyPassword('UpperBoundPass!2026#16', cliLikeHashLn16)).toBe(true);
    expect(await upperBoundHasher.verifyPassword('SyntheticSecret!2026#0', hash0)).toBe(true);

    // Queue overflow sheds excess concurrent hashing attempts with LoginThrottledException.
    const burst = Array.from({ length: 22 }, () => hasher.verifyOrEqualize('ValidPass!123456', null));
    const burstOutcomes = await Promise.allSettled(burst);
    expect(
      burstOutcomes.some(
        (o) => o.status === 'rejected' && o.reason instanceof LoginThrottledException,
      ),
    ).toBe(true);
  });
});

describe('CsrfService', () => {
  it('parses cookies safely, binds pre-login and authenticated tokens via HMAC, enforces exact Origin, and sets strict cookie flags', () => {
    const csrf = new CsrfService();

    expect(csrf.parseCookies(undefined).size).toBe(0);
    expect(csrf.parseCookies('a'.repeat(9000)).size).toBe(0);

    const cookies = csrf.parseCookies('foo=bar; malformed; encoded=a%20b; badpct=%E0%A4%A; foo=second');
    expect(cookies.get('foo')).toBe('bar');
    expect(cookies.get('encoded')).toBe('a b');
    expect(cookies.get('badpct')).toBe('%E0%A4%A');

    const preSecretA = csrf.generateOpaqueToken();
    const preSecretB = csrf.generateOpaqueToken();
    const preTokenA = csrf.computePreLoginToken(preSecretA);

    expect(csrf.verifyPreLoginToken(preSecretA, preTokenA)).toBe(true);
    expect(csrf.verifyPreLoginToken(preSecretB, preTokenA)).toBe(false);
    expect(csrf.verifyPreLoginToken(undefined, preTokenA)).toBe(false);
    expect(csrf.verifyPreLoginToken(preSecretA, 'short')).toBe(false);

    const sessionToken = csrf.generateOpaqueToken();
    const sessionCtx = {
      rawToken: sessionToken,
      id: '11111111-2222-4333-8444-555555555555',
      csrfSalt: 'a'.repeat(64),
    };
    const authToken = csrf.computeAuthenticatedToken(
      sessionCtx.rawToken,
      sessionCtx.id,
      sessionCtx.csrfSalt,
    );

    expect(csrf.verifyAuthenticatedToken(sessionCtx, authToken)).toBe(true);
    expect(csrf.verifyAuthenticatedToken(sessionCtx, preTokenA)).toBe(false);
    expect(csrf.verifyAuthenticatedToken(sessionCtx, undefined)).toBe(false);

    expect(csrf.verifyExactOrigin('https://hub.synthetic.invalid', 'https://hub.synthetic.invalid')).toBe(true);
    expect(csrf.verifyExactOrigin('http://hub.synthetic.invalid', 'https://hub.synthetic.invalid')).toBe(false);
    expect(csrf.verifyExactOrigin('null', 'https://hub.synthetic.invalid')).toBe(false);
    expect(csrf.verifyExactOrigin(undefined, 'https://hub.synthetic.invalid')).toBe(false);
    expect(csrf.verifyExactOrigin(['https://hub.synthetic.invalid'], 'https://hub.synthetic.invalid')).toBe(false);

    for (const opts of [
      csrf.buildSessionCookieOptions(3600),
      csrf.buildPreLoginCookieOptions(),
      csrf.buildClearCookieOptions(),
    ]) {
      expect(opts.httpOnly).toBe(true);
      expect(opts.secure).toBe(true);
      expect(opts.sameSite).toBe('lax');
      expect(opts.path).toBe('/');
      expect(opts.domain).toBeUndefined();
    }
  });
});

describe('LoginThrottlerService', () => {
  it('counts failures and in-flight reservations, settles once per outcome, preserves active reservations on success and eviction, and recovers after error and block expiry', () => {
    const throttler = new LoginThrottlerService(baseTestEnv);
    const t0 = 1_700_000_000_000;

    // Admission at configured limit (maxAttempts = 3): 3 concurrent reservations admitted, 4th rejected.
    const res1 = throttler.reserveAttempt('198.51.100.1', t0);
    const res2 = throttler.reserveAttempt('198.51.100.1', t0 + 10);
    const res3 = throttler.reserveAttempt('198.51.100.1', t0 + 20);
    expect(() => throttler.reserveAttempt('198.51.100.1', t0 + 30)).toThrow(LoginThrottledException);

    // Independent IP is unaffected while 198.51.100.1 is at its in-flight limit.
    const otherIpRes = throttler.reserveAttempt('198.51.100.2', t0 + 30);
    otherIpRes.settle('success', t0 + 40);

    // Internal error releases reservation without recording a failure; double-settle is a no-op.
    res1.settle('error', t0 + 50);
    res1.settle('invalid_credentials', t0 + 60);
    expect(res1.isSettled).toBe(true);

    // One slot freed on 198.51.100.1 after error; reserving again succeeds, and a 4th is still blocked.
    const res4 = throttler.reserveAttempt('198.51.100.1', t0 + 70);
    expect(() => throttler.reserveAttempt('198.51.100.1', t0 + 80)).toThrow(LoginThrottledException);

    // Settling success on res2 clears prior failures while preserving res3 and res4's in-flight reservations (2 remaining).
    res2.settle('success', t0 + 90);
    const res5 = throttler.reserveAttempt('198.51.100.1', t0 + 100);
    expect(() => throttler.reserveAttempt('198.51.100.1', t0 + 110)).toThrow(LoginThrottledException);

    // Settle all 3 active reservations as invalid_credentials -> reaches maxAttempts (3) and blocks for blockSeconds (120s).
    res3.settle('invalid_credentials', t0 + 1000);
    res4.settle('invalid_credentials', t0 + 1100);
    res5.settle('invalid_credentials', t0 + 1200);
    expect(() => throttler.reserveAttempt('198.51.100.1', t0 + 5000)).toThrow(LoginThrottledException);

    // Recovery after block expiry (even when windowSeconds > blockSeconds or vice versa).
    const recovered = throttler.reserveAttempt('198.51.100.1', t0 + 125_000);
    recovered.settle('success', t0 + 125_100);

    // Blank/unknown IP normalization and clean error cleanup.
    const blankRes = throttler.reserveAttempt('   ', t0 + 130_000);
    blankRes.settle('error', t0 + 130_050);

    // Bucket eviction (maxKeys = 16) preserves active in-flight reservations on older keys.
    const pinnedA = throttler.reserveAttempt('198.51.100.200', t0 + 200_000);
    const pinnedB = throttler.reserveAttempt('198.51.100.200', t0 + 200_001);
    for (let i = 0; i < 25; i += 1) {
      const transient = throttler.reserveAttempt(`203.0.113.${i}`, t0 + 200_010 + i);
      transient.settle('invalid_credentials', t0 + 200_020 + i);
    }
    expect(throttler.getTrackedKeyCount()).toBeLessThanOrEqual(16);

    // 198.51.100.200 still has 2 in-flight reservations: 1 more is allowed (total 3), 2nd more is throttled.
    const pinnedC = throttler.reserveAttempt('198.51.100.200', t0 + 200_100);
    expect(() => throttler.reserveAttempt('198.51.100.200', t0 + 200_101)).toThrow(
      LoginThrottledException,
    );
    pinnedA.settle('error', t0 + 200_200);
    pinnedB.settle('error', t0 + 200_201);
    pinnedC.settle('error', t0 + 200_202);

    // Expired idle entries are swept before evicting active ones once maxKeys (16) is reached.
    const afterSweep1 = throttler.reserveAttempt('203.0.113.250', t0 + 500_000);
    afterSweep1.settle('invalid_credentials', t0 + 500_010);
    const afterSweep2 = throttler.reserveAttempt('203.0.113.251', t0 + 500_020);
    afterSweep2.settle('invalid_credentials', t0 + 500_030);
    expect(throttler.getTrackedKeyCount()).toBe(2);

    // Single-attempt strict policy admits 1 attempt, blocks on its invalid-credentials settlement, and recovers after block expiry.
    const singleAttemptEnv = validateApiEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://qaeh:synthetic@localhost:5432/qaeh',
      TRUST_PROXY: 'false',
      AUTH_LOGIN_MAX_ATTEMPTS: '1',
      AUTH_LOGIN_WINDOW_SECONDS: '300',
      AUTH_LOGIN_BLOCK_SECONDS: '10',
      AUTH_THROTTLE_MAX_KEYS: '16',
    });
    const strictThrottler = new LoginThrottlerService(singleAttemptEnv);
    const strictAttempt = strictThrottler.reserveAttempt('198.51.100.77', t0);
    expect(() => strictThrottler.reserveAttempt('198.51.100.77', t0 + 1)).toThrow(
      LoginThrottledException,
    );
    strictAttempt.settle('invalid_credentials', t0 + 50);
    expect(() => strictThrottler.reserveAttempt('198.51.100.77', t0 + 5000)).toThrow(
      LoginThrottledException,
    );
    const afterStrictBlock = strictThrottler.reserveAttempt('198.51.100.77', t0 + 11_000);
    afterStrictBlock.settle('success', t0 + 11_010);

    // If all maxKeys (16) slots simultaneously hold in-flight reservations, excess keys shed with 429 rather than evicting active reservations.
    const activeHandles = Array.from({ length: 16 }, (_, idx) =>
      strictThrottler.reserveAttempt(`198.51.101.${idx}`, t0 + 20_000 + idx),
    );
    expect(() => strictThrottler.reserveAttempt('198.51.101.99', t0 + 20_100)).toThrow(
      LoginThrottledException,
    );
    activeHandles[0]!.settle('error', t0 + 20_101);
    const admittedAfterRelease = strictThrottler.reserveAttempt('198.51.101.99', t0 + 20_102);
    admittedAfterRelease.settle('success', t0 + 20_103);
    for (const h of activeHandles.slice(1)) {
      h.settle('error', t0 + 20_200);
    }
  });
});

describe('AuthService and AuthAndCsrfGuard', () => {
  it('enforces explicit actor authorization independently of HTTP controllers and handles session/CSRF flows', async () => {
    const hasher = new PasswordHasherService(baseTestEnv);
    const csrf = new CsrfService();
    const throttler = new LoginThrottlerService(baseTestEnv);
    const ownerPasswordHash = await hasher.hashPassword('ValidSyntheticPass!2026');

    const storedSessions = new Map<
      string,
      {
        id: string;
        ownerId: string;
        tokenDigest: string;
        csrfSalt: string;
        createdAt: Date;
        expiresAt: Date;
        revokedAt: Date | null;
        revokeReason: string | null;
      }
    >();

    const ownerRow = {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      singletonKey: true,
      loginIdentifier: 'owner@synthetic.invalid',
      passwordHash: ownerPasswordHash,
      timezone: 'Europe/Bratislava',
      createdAt: new Date('2026-11-21T00:00:00Z'),
      updatedAt: new Date('2026-11-21T00:00:00Z'),
    };

    const mockClient = {
      owner: {
        findFirst: vi.fn(async () => ownerRow),
      },
      $queryRaw: vi.fn(async () => [
        {
          id: ownerRow.id,
          login_identifier: ownerRow.loginIdentifier,
          password_hash: ownerRow.passwordHash,
          timezone: ownerRow.timezone,
        },
      ]),
      authSession: {
        findUnique: vi.fn(async ({ where }: { where: { tokenDigest: string } }) => {
          const found = storedSessions.get(where.tokenDigest);
          return found ? { ...found, owner: ownerRow } : null;
        }),
        findMany: vi.fn(async () =>
          [...storedSessions.values()]
            .filter((s) => s.revokedAt === null)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((s) => ({ id: s.id })),
        ),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: {
              id?: string | { in: string[] };
              ownerId?: string;
              tokenDigest?: string;
              revokedAt: null;
            };
            data: { revokedAt: Date; revokeReason: string };
          }) => {
            let count = 0;
            for (const s of storedSessions.values()) {
              const matchId =
                !where.id ||
                (typeof where.id === 'string' ? s.id === where.id : where.id.in.includes(s.id));
              const matchOwner = !where.ownerId || s.ownerId === where.ownerId;
              const matchDigest = !where.tokenDigest || s.tokenDigest === where.tokenDigest;
              if (matchId && matchOwner && matchDigest && s.revokedAt === null) {
                s.revokedAt = data.revokedAt;
                s.revokeReason = data.revokeReason;
                count += 1;
              }
            }
            return { count };
          },
        ),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(
          async ({
            data,
          }: {
            data: {
              id: string;
              ownerId: string;
              tokenDigest: string;
              csrfSalt: string;
              createdAt: Date;
              expiresAt: Date;
            };
          }) => {
            const row = { ...data, revokedAt: null, revokeReason: null };
            storedSessions.set(data.tokenDigest, row);
            return row;
          },
        ),
      },
      $transaction: vi.fn(async <T>(fn: (tx: typeof mockClient) => Promise<T>) => fn(mockClient)),
    };

    const prismaStub = { client: mockClient } as unknown as PrismaService;
    const service = new AuthService(baseTestEnv, prismaStub, hasher, csrf, throttler);

    // Direct service calls without an authenticated actor must throw UnauthorizedException.
    expect(() => service.getSessionView(undefined)).toThrow(UnauthorizedException);
    await expect(service.logout(undefined)).rejects.toThrow(UnauthorizedException);

    // Invalid token format returns null without DB query.
    expect(await service.authenticateSessionToken(undefined)).toBeNull();
    expect(await service.authenticateSessionToken('short')).toBeNull();
    expect(mockClient.authSession.findUnique).not.toHaveBeenCalled();

    // Bootstrap pre-login CSRF (fresh cookie vs existing cookie).
    const boot1 = await service.bootstrapCsrf({});
    expect(boot1.kind).toBe('prelogin');
    if (boot1.kind !== 'prelogin') throw new Error('Expected prelogin');
    expect(boot1.newPreLoginCookieValue).toBeDefined();

    const boot2 = await service.bootstrapCsrf({
      preLoginCookieValue: boot1.newPreLoginCookieValue,
    });
    expect(boot2).toEqual({
      kind: 'prelogin',
      csrfToken: boot1.csrfToken,
    });

    // Login failure increments throttler and throws UnauthorizedException.
    await expect(
      service.login({
        loginIdentifier: 'wrong@synthetic.invalid',
        password: 'ValidSyntheticPass!2026',
        clientIp: '198.51.100.20',
      }),
    ).rejects.toThrow(UnauthorizedException);

    // Login success issues session and revokes previous session when supplied.
    const loginA = await service.login({
      loginIdentifier: 'OWNER@synthetic.invalid',
      password: 'ValidSyntheticPass!2026',
      clientIp: '198.51.100.20',
    });
    const loginB = await service.login({
      loginIdentifier: 'owner@synthetic.invalid',
      password: 'ValidSyntheticPass!2026',
      clientIp: '198.51.100.20',
      previousSessionToken: loginA.rawSessionToken,
    });

    expect(storedSessions.get(hashSessionTokenDigest(loginA.rawSessionToken))?.revokedAt).not.toBeNull();
    expect(await service.authenticateSessionToken(loginA.rawSessionToken)).toBeNull();

    const verifiedB = await service.authenticateSessionToken(loginB.rawSessionToken);
    expect(verifiedB).not.toBeNull();

    const bootAuth = await service.bootstrapCsrf({ rawSessionToken: loginB.rawSessionToken });
    expect(bootAuth).toEqual({ kind: 'authenticated', csrfToken: loginB.csrfToken });

    const view = service.getSessionView(verifiedB!.actor);
    expect(view.authenticated).toBe(true);
    expect(view.owner.loginIdentifier).toBe('owner@synthetic.invalid');

    // Guard & decorator unit checks (including HTTPS transport enforcement and re-login with active session CSRF).
    class SampleHealth {
      @PublicHealth()
      public probe(): void {}
    }
    class SampleAuth {
      @Public()
      @PreLoginCsrfRoute()
      public login(): void {}
    }
    expect(Reflect.getMetadata(IS_HEALTH_PUBLIC_ROUTE_KEY, SampleHealth.prototype.probe)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_ROUTE_KEY, SampleAuth.prototype.login)).toBe(true);
    expect(Reflect.getMetadata(IS_PRELOGIN_CSRF_ROUTE_KEY, SampleAuth.prototype.login)).toBe(true);

    const reflector = new Reflector();
    const guard = new AuthAndCsrfGuard(reflector, baseTestEnv, service, csrf);

    const buildContext = (opts: {
      method: string;
      secure: boolean;
      headers?: Record<string, string>;
      handler: (...args: unknown[]) => unknown;
      cls: new () => unknown;
      actor?: AuthenticatedActor;
      fromTrustedProxy?: boolean;
    }): { ctx: ExecutionContext; req: AuthenticatedRequest; headersOut: Map<string, string> } => {
      const headersOut = new Map<string, string>();
      const req = {
        method: opts.method,
        secure: opts.secure,
        headers: opts.headers ?? {},
        socket: { remoteAddress: '172.20.0.5' },
        app: {
          get: () => () => Boolean(opts.fromTrustedProxy),
        },
        authenticatedActor: opts.actor,
      } as unknown as AuthenticatedRequest;
      const res = {
        setHeader: (k: string, v: string) => {
          headersOut.set(k.toLowerCase(), v);
        },
      };
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => res,
        }),
        getHandler: () => opts.handler,
        getClass: () => opts.cls,
      } as unknown as ExecutionContext;
      return { ctx, req, headersOut };
    };

    // PublicHealth GET succeeds even over internal non-TLS probe.
    const healthCall = buildContext({
      method: 'GET',
      secure: false,
      handler: SampleHealth.prototype.probe,
      cls: SampleHealth,
    });
    expect(await guard.canActivate(healthCall.ctx)).toBe(true);

    // Non-health route over insecure transport when APP_ORIGIN is https:// fails with 403.
    const insecureLogin = buildContext({
      method: 'POST',
      secure: false,
      handler: SampleAuth.prototype.login,
      cls: SampleAuth,
    });
    await expect(guard.canActivate(insecureLogin.ctx)).rejects.toThrow(ForbiddenException);

    // Pre-login route accepts authenticated session + authenticated CSRF when re-authenticating over HTTPS.
    const reloginCall = buildContext({
      method: 'POST',
      secure: true,
      headers: {
        origin: 'https://hub.synthetic.invalid',
        cookie: `${SESSION_COOKIE_NAME}=${loginB.rawSessionToken}`,
        [CSRF_HEADER_NAME]: loginB.csrfToken,
      },
      handler: SampleAuth.prototype.login,
      cls: SampleAuth,
    });
    expect(await guard.canActivate(reloginCall.ctx)).toBe(true);

    // Protected route sets actor and extractActorFromContext reads it cleanly.
    class ProtectedEndpoint {
      public mutate(): void {}
    }
    const anonProtected = buildContext({
      method: 'GET',
      secure: true,
      handler: ProtectedEndpoint.prototype.mutate,
      cls: ProtectedEndpoint,
    });
    await expect(guard.canActivate(anonProtected.ctx)).rejects.toThrow(UnauthorizedException);

    const protectedRead = buildContext({
      method: 'GET',
      secure: false,
      fromTrustedProxy: false,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${loginB.rawSessionToken}`,
      },
      handler: ProtectedEndpoint.prototype.mutate,
      cls: ProtectedEndpoint,
    });
    expect(await guard.canActivate(protectedRead.ctx)).toBe(true);
    expect(extractActorFromContext(protectedRead.ctx)).toEqual(verifiedB!.actor);

    const insecureProxyProtectedRead = buildContext({
      method: 'GET',
      secure: false,
      fromTrustedProxy: true,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${loginB.rawSessionToken}`,
      },
      handler: ProtectedEndpoint.prototype.mutate,
      cls: ProtectedEndpoint,
    });
    await expect(guard.canActivate(insecureProxyProtectedRead.ctx)).rejects.toThrow(ForbiddenException);

    const protectedWriteNoOrigin = buildContext({
      method: 'POST',
      secure: true,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${loginB.rawSessionToken}`,
        [CSRF_HEADER_NAME]: loginB.csrfToken,
      },
      handler: ProtectedEndpoint.prototype.mutate,
      cls: ProtectedEndpoint,
    });
    await expect(guard.canActivate(protectedWriteNoOrigin.ctx)).rejects.toThrow(ForbiddenException);

    const preSecret = csrf.generateOpaqueToken();
    const validPreLoginCall = buildContext({
      method: 'POST',
      secure: true,
      headers: {
        origin: 'https://hub.synthetic.invalid',
        cookie: `${PRELOGIN_CSRF_COOKIE_NAME}=${preSecret}`,
        [CSRF_HEADER_NAME]: csrf.computePreLoginToken(preSecret),
      },
      handler: SampleAuth.prototype.login,
      cls: SampleAuth,
    });
    expect(await guard.canActivate(validPreLoginCall.ctx)).toBe(true);

    const invalidPreLoginCall = buildContext({
      method: 'POST',
      secure: true,
      headers: {
        origin: 'https://hub.synthetic.invalid',
        cookie: `${PRELOGIN_CSRF_COOKIE_NAME}=${preSecret}`,
        [CSRF_HEADER_NAME]: 'wrong',
      },
      handler: SampleAuth.prototype.login,
      cls: SampleAuth,
    });
    await expect(guard.canActivate(invalidPreLoginCall.ctx)).rejects.toThrow(ForbiddenException);

    const protectedWriteOk = buildContext({
      method: 'POST',
      secure: true,
      headers: {
        origin: 'https://hub.synthetic.invalid',
        cookie: `${SESSION_COOKIE_NAME}=${loginB.rawSessionToken}`,
        [CSRF_HEADER_NAME]: loginB.csrfToken,
      },
      handler: ProtectedEndpoint.prototype.mutate,
      cls: ProtectedEndpoint,
    });
    expect(await guard.canActivate(protectedWriteOk.ctx)).toBe(true);

    const protectedWriteBadCsrf = buildContext({
      method: 'POST',
      secure: true,
      headers: {
        origin: 'https://hub.synthetic.invalid',
        cookie: `${SESSION_COOKIE_NAME}=${loginB.rawSessionToken}`,
        [CSRF_HEADER_NAME]: csrf.computePreLoginToken(csrf.generateOpaqueToken()),
      },
      handler: ProtectedEndpoint.prototype.mutate,
      cls: ProtectedEndpoint,
    });
    await expect(guard.canActivate(protectedWriteBadCsrf.ctx)).rejects.toThrow(ForbiddenException);

    // Active session cap evicts oldest session when exceeding 20 concurrent active sessions.
    for (let idx = 0; idx < 21; idx += 1) {
      await service.login({
        loginIdentifier: 'owner@synthetic.invalid',
        password: 'ValidSyntheticPass!2026',
        clientIp: `198.51.100.${50 + idx}`,
        now: new Date(1_700_000_000_000 + idx * 1000),
      });
    }
    const activeRemaining = [...storedSessions.values()].filter((s) => s.revokedAt === null);
    expect(activeRemaining.length).toBeLessThanOrEqual(20);

    // Concurrent password rotation detected on locked owner row returns generic 401 without creating a session.
    const sessionCountBeforeRace = storedSessions.size;
    mockClient.$queryRaw.mockResolvedValueOnce([
      {
        id: ownerRow.id,
        login_identifier: ownerRow.loginIdentifier,
        password_hash: await hasher.hashPassword('RotatedElsewhere!2026'),
        timezone: ownerRow.timezone,
      },
    ]);
    await expect(
      service.login({
        loginIdentifier: 'owner@synthetic.invalid',
        password: 'ValidSyntheticPass!2026',
        clientIp: '198.51.100.190',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(storedSessions.size).toBe(sessionCountBeforeRace);

    // Internal DB error settles the throttler reservation on error without blocking subsequent valid attempts.
    mockClient.owner.findFirst.mockRejectedValueOnce(new Error('transient db outage'));
    await expect(
      service.login({
        loginIdentifier: 'owner@synthetic.invalid',
        password: 'ValidSyntheticPass!2026',
        clientIp: '198.51.100.191',
      }),
    ).rejects.toThrow('transient db outage');

    const postErrorLogin = await service.login({
      loginIdentifier: 'owner@synthetic.invalid',
      password: 'ValidSyntheticPass!2026',
      clientIp: '198.51.100.191',
    });
    expect(postErrorLogin.owner.id).toBe(ownerRow.id);

    await service.logout(verifiedB!.actor);
    expect(await service.authenticateSessionToken(loginB.rawSessionToken)).toBeNull();
  });
});
