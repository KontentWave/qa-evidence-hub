import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { API_ENV, type ApiEnv } from '../config/env.validation';
import { TRUSTED_PROXY_CHECKER_KEY } from '../config/trusted-proxy';
import {
  type AuthenticatedRequest,
  IS_HEALTH_PUBLIC_ROUTE_KEY,
  IS_PRELOGIN_CSRF_ROUTE_KEY,
  IS_PUBLIC_ROUTE_KEY,
} from './auth.decorators';
import { AuthService } from './auth.service';
import {
  CSRF_HEADER_NAME,
  CsrfService,
  PRELOGIN_CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from './csrf.service';

const SAFE_READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class AuthAndCsrfGuard implements CanActivate {
  private readonly appOrigin: string;
  private readonly requireSecureTransport: boolean;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(API_ENV) env: ApiEnv,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(CsrfService) private readonly csrfService: CsrfService,
  ) {
    this.appOrigin = env.appOrigin;
    this.requireSecureTransport = env.appOrigin.startsWith('https://');
  }

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const res = http.getResponse<Response>();

    const targets = [context.getHandler(), context.getClass()];
    const isHealthPublic = this.reflector.getAllAndOverride<boolean>(
      IS_HEALTH_PUBLIC_ROUTE_KEY,
      targets,
    );
    if (isHealthPublic && SAFE_READ_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    res.setHeader('Cache-Control', 'private, no-store, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const method = req.method.toUpperCase();
    const isSafeRead = SAFE_READ_METHODS.has(method);
    const isPublicRoute = Boolean(
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE_KEY, targets),
    );
    const isPreLoginCsrfRoute = Boolean(
      this.reflector.getAllAndOverride<boolean>(IS_PRELOGIN_CSRF_ROUTE_KEY, targets),
    );

    if (this.requireSecureTransport && !req.secure) {
      const peerChecker = req.app?.get?.(TRUSTED_PROXY_CHECKER_KEY) as
        | ((rawIp: string | undefined) => boolean)
        | undefined;
      const fromTrustedProxy = peerChecker ? peerChecker(req.socket?.remoteAddress) : false;

      // Mutations, public CSRF/auth bootstrap routes, and any request arriving through the
      // public Nginx proxy MUST use verified HTTPS when APP_ORIGIN is https://.
      // Only internal container-to-container SSR SAFE_READ_METHODS on private networks may
      // read session state over internal HTTP without emitting Set-Cookie.
      if (!isSafeRead || isPublicRoute || fromTrustedProxy) {
        throw new ForbiddenException();
      }
    }

    const cookies = this.csrfService.parseCookies(req.headers.cookie);
    const rawSessionCookie = cookies.get(SESSION_COOKIE_NAME);

    if (!isPublicRoute) {
      const verified = await this.authService.authenticateSessionToken(rawSessionCookie);
      if (!verified) {
        throw new UnauthorizedException();
      }
      req.authenticatedActor = verified.actor;
      req.authenticatedSession = verified.session;
    }

    if (isSafeRead) {
      return true;
    }

    if (!this.csrfService.verifyExactOrigin(req.headers.origin, this.appOrigin)) {
      throw new ForbiddenException();
    }

    const rawCsrfHeader = req.headers[CSRF_HEADER_NAME];
    const submittedCsrf = typeof rawCsrfHeader === 'string' ? rawCsrfHeader.trim() : undefined;

    if (isPreLoginCsrfRoute) {
      const preLoginSecret = cookies.get(PRELOGIN_CSRF_COOKIE_NAME);
      if (this.csrfService.verifyPreLoginToken(preLoginSecret, submittedCsrf)) {
        return true;
      }

      const existingSession = await this.authService.authenticateSessionToken(rawSessionCookie);
      if (
        existingSession &&
        this.csrfService.verifyAuthenticatedToken(existingSession.session, submittedCsrf)
      ) {
        return true;
      }

      throw new ForbiddenException();
    }

    const activeSession = req.authenticatedSession;
    if (!activeSession || !this.csrfService.verifyAuthenticatedToken(activeSession, submittedCsrf)) {
      throw new ForbiddenException();
    }

    return true;
  }
}
