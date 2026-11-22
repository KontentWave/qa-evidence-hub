import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CookieOptions } from 'express';

export const SESSION_COOKIE_NAME = 'qaeh_session';
export const PRELOGIN_CSRF_COOKIE_NAME = 'qaeh_csrf_prelogin';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const PRELOGIN_COOKIE_MAX_AGE_SECONDS = 900;

const SAFE_TOKEN_REGEX = /^[A-Za-z0-9_-]{32,128}$/;

@Injectable()
export class CsrfService {
  public parseCookies(cookieHeader: string | undefined): ReadonlyMap<string, string> {
    const parsed = new Map<string, string>();
    if (!cookieHeader || cookieHeader.length > 8192) {
      return parsed;
    }

    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) {
        continue;
      }
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) {
        continue;
      }
      const name = trimmed.slice(0, eqIdx).trim();
      const rawVal = trimmed.slice(eqIdx + 1).trim();
      if (!parsed.has(name)) {
        try {
          parsed.set(name, decodeURIComponent(rawVal));
        } catch {
          parsed.set(name, rawVal);
        }
      }
    }

    return parsed;
  }

  public isValidOpaqueToken(value: string | undefined): value is string {
    return typeof value === 'string' && SAFE_TOKEN_REGEX.test(value);
  }

  public generateOpaqueToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  public computePreLoginToken(preLoginCookieSecret: string): string {
    return crypto
      .createHmac('sha256', preLoginCookieSecret)
      .update('qaeh-prelogin-csrf-v1', 'utf8')
      .digest('base64url');
  }

  public verifyPreLoginToken(
    preLoginCookieSecret: string | undefined,
    submittedToken: string | undefined,
  ): boolean {
    if (!this.isValidOpaqueToken(preLoginCookieSecret) || !this.isValidOpaqueToken(submittedToken)) {
      return false;
    }
    const expected = this.computePreLoginToken(preLoginCookieSecret);
    return this.safeStringEqual(expected, submittedToken);
  }

  public computeAuthenticatedToken(
    rawSessionToken: string,
    sessionId: string,
    csrfSalt: string,
  ): string {
    return crypto
      .createHmac('sha256', rawSessionToken)
      .update(`qaeh-auth-csrf-v1:${sessionId}:${csrfSalt}`, 'utf8')
      .digest('base64url');
  }

  public verifyAuthenticatedToken(
    session: { readonly rawToken: string; readonly id: string; readonly csrfSalt: string },
    submittedToken: string | undefined,
  ): boolean {
    if (!this.isValidOpaqueToken(submittedToken)) {
      return false;
    }
    const expected = this.computeAuthenticatedToken(session.rawToken, session.id, session.csrfSalt);
    return this.safeStringEqual(expected, submittedToken);
  }

  public verifyExactOrigin(originHeader: string | string[] | undefined, expectedOrigin: string): boolean {
    if (typeof originHeader !== 'string' || originHeader.length === 0 || originHeader === 'null') {
      return false;
    }
    return this.safeStringEqual(originHeader, expectedOrigin);
  }

  public buildSessionCookieOptions(maxAgeSeconds: number): CookieOptions {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds * 1000,
    };
  }

  public buildPreLoginCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: PRELOGIN_COOKIE_MAX_AGE_SECONDS * 1000,
    };
  }

  public buildClearCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    };
  }

  private safeStringEqual(left: string, right: string): boolean {
    const leftBuf = Buffer.from(left, 'utf8');
    const rightBuf = Buffer.from(right, 'utf8');
    if (leftBuf.length !== rightBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(leftBuf, rightBuf);
  }
}
