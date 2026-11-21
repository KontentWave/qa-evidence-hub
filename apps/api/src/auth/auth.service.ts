import crypto from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { API_ENV, type ApiEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedActor, AuthenticatedSessionContext } from './auth.decorators';
import { CsrfService } from './csrf.service';
import { LoginThrottlerService } from './login-throttler.service';
import { PasswordHasherService } from './password-hasher.service';

export interface OwnerSummary {
  readonly id: string;
  readonly loginIdentifier: string;
  readonly timezone: string;
}

export interface VerifiedSessionResult {
  readonly actor: AuthenticatedActor;
  readonly session: AuthenticatedSessionContext;
}

export type CsrfBootstrapResult =
  | {
      readonly kind: 'authenticated';
      readonly csrfToken: string;
    }
  | {
      readonly kind: 'prelogin';
      readonly csrfToken: string;
      readonly newPreLoginCookieValue?: string;
    };

export interface LoginSuccessResult {
  readonly owner: OwnerSummary;
  readonly rawSessionToken: string;
  readonly sessionTtlSeconds: number;
  readonly csrfToken: string;
}

const STALE_EXPIRED_PURGE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_SESSIONS_PER_OWNER = 20;

export function hashSessionTokenDigest(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

@Injectable()
export class AuthService {
  private readonly sessionTtlSeconds: number;

  constructor(
    @Inject(API_ENV) env: ApiEnv,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(PasswordHasherService) private readonly passwordHasher: PasswordHasherService,
    @Inject(CsrfService) private readonly csrfService: CsrfService,
    @Inject(LoginThrottlerService) private readonly loginThrottler: LoginThrottlerService,
  ) {
    this.sessionTtlSeconds = env.sessionTtlSeconds;
  }

  /**
   * Read-only session verification used by both HTTP guards and SSR /api/v1/auth/session.
   * Performs strictly SELECT queries with zero database mutations or sliding-expiry writes.
   */
  public async authenticateSessionToken(
    rawSessionToken: string | undefined,
    now = new Date(),
  ): Promise<VerifiedSessionResult | null> {
    if (!this.csrfService.isValidOpaqueToken(rawSessionToken)) {
      return null;
    }

    const tokenDigest = hashSessionTokenDigest(rawSessionToken);
    const sessionRow = await this.prismaService.client.authSession.findUnique({
      where: { tokenDigest },
      include: { owner: true },
    });

    if (!sessionRow || sessionRow.revokedAt !== null || sessionRow.expiresAt <= now) {
      return null;
    }

    return {
      actor: {
        ownerId: sessionRow.owner.id,
        loginIdentifier: sessionRow.owner.loginIdentifier,
        timezone: sessionRow.owner.timezone,
        sessionId: sessionRow.id,
      },
      session: {
        id: sessionRow.id,
        csrfSalt: sessionRow.csrfSalt,
        rawToken: rawSessionToken,
        expiresAt: sessionRow.expiresAt,
      },
    };
  }

  public async bootstrapCsrf(input: {
    readonly rawSessionToken?: string;
    readonly preLoginCookieValue?: string;
    readonly now?: Date;
  }): Promise<CsrfBootstrapResult> {
    const verified = await this.authenticateSessionToken(input.rawSessionToken, input.now);
    if (verified) {
      const csrfToken = this.csrfService.computeAuthenticatedToken(
        verified.session.rawToken,
        verified.session.id,
        verified.session.csrfSalt,
      );
      return { kind: 'authenticated', csrfToken };
    }

    if (this.csrfService.isValidOpaqueToken(input.preLoginCookieValue)) {
      return {
        kind: 'prelogin',
        csrfToken: this.csrfService.computePreLoginToken(input.preLoginCookieValue),
      };
    }

    const freshSecret = this.csrfService.generateOpaqueToken();
    return {
      kind: 'prelogin',
      csrfToken: this.csrfService.computePreLoginToken(freshSecret),
      newPreLoginCookieValue: freshSecret,
    };
  }

  public async login(input: {
    readonly loginIdentifier: string;
    readonly password: string;
    readonly clientIp: string;
    readonly previousSessionToken?: string;
    readonly now?: Date;
  }): Promise<LoginSuccessResult> {
    const now = input.now ?? new Date();
    const nowMs = now.getTime();

    this.loginThrottler.assertAllowed(input.clientIp, nowMs);

    const normalizedLogin = input.loginIdentifier.trim();
    const owner = await this.prismaService.client.owner.findFirst({
      where: { singletonKey: true },
    });

    const identifierMatches =
      owner !== null && owner.loginIdentifier.toLowerCase() === normalizedLogin.toLowerCase();

    const passwordValid = await this.passwordHasher.verifyOrEqualize(
      input.password,
      identifierMatches ? owner.passwordHash : null,
    );

    if (!owner || !identifierMatches || !passwordValid) {
      this.loginThrottler.recordFailure(input.clientIp, nowMs);
      throw new UnauthorizedException();
    }

    this.loginThrottler.resetKey(input.clientIp);

    const rawSessionToken = this.csrfService.generateOpaqueToken();
    const tokenDigest = hashSessionTokenDigest(rawSessionToken);
    const csrfSalt = crypto.randomBytes(32).toString('hex');
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(nowMs + this.sessionTtlSeconds * 1000);
    const staleCutoff = new Date(nowMs - STALE_EXPIRED_PURGE_AGE_MS);

    const previousDigest = this.csrfService.isValidOpaqueToken(input.previousSessionToken)
      ? hashSessionTokenDigest(input.previousSessionToken)
      : null;

    await this.prismaService.client.$transaction(async (tx) => {
      if (previousDigest) {
        await tx.authSession.updateMany({
          where: {
            tokenDigest: previousDigest,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokeReason: 'reauthenticated',
          },
        });
      }

      await tx.authSession.deleteMany({
        where: {
          expiresAt: { lt: staleCutoff },
        },
      });

      const activeExisting = await tx.authSession.findMany({
        where: {
          ownerId: owner.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      const overflowCount = activeExisting.length - (MAX_ACTIVE_SESSIONS_PER_OWNER - 1);
      if (overflowCount > 0) {
        const idsToEvict = activeExisting.slice(0, overflowCount).map((row) => row.id);
        await tx.authSession.updateMany({
          where: {
            id: { in: idsToEvict },
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokeReason: 'session_cap_evicted',
          },
        });
      }

      await tx.authSession.create({
        data: {
          id: sessionId,
          ownerId: owner.id,
          tokenDigest,
          csrfSalt,
          createdAt: now,
          expiresAt,
        },
      });
    });

    const csrfToken = this.csrfService.computeAuthenticatedToken(
      rawSessionToken,
      sessionId,
      csrfSalt,
    );

    return {
      owner: {
        id: owner.id,
        loginIdentifier: owner.loginIdentifier,
        timezone: owner.timezone,
      },
      rawSessionToken,
      sessionTtlSeconds: this.sessionTtlSeconds,
      csrfToken,
    };
  }

  public getSessionView(actor: AuthenticatedActor | undefined): {
    readonly authenticated: true;
    readonly owner: OwnerSummary;
  } {
    this.assertAuthorizedActor(actor);
    return {
      authenticated: true,
      owner: {
        id: actor.ownerId,
        loginIdentifier: actor.loginIdentifier,
        timezone: actor.timezone,
      },
    };
  }

  public async logout(
    actor: AuthenticatedActor | undefined,
    now = new Date(),
  ): Promise<{ readonly authenticated: false }> {
    this.assertAuthorizedActor(actor);
    await this.prismaService.client.authSession.updateMany({
      where: {
        id: actor.sessionId,
        ownerId: actor.ownerId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokeReason: 'logout',
      },
    });
    return { authenticated: false };
  }

  private assertAuthorizedActor(
    actor: AuthenticatedActor | undefined,
  ): asserts actor is AuthenticatedActor {
    if (!actor || !actor.ownerId || !actor.sessionId) {
      throw new UnauthorizedException();
    }
  }
}
