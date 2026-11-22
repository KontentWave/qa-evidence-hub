import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';

export const IS_PUBLIC_ROUTE_KEY = 'qaeh:is_public_route';
export const IS_HEALTH_PUBLIC_ROUTE_KEY = 'qaeh:is_health_public_route';
export const IS_PRELOGIN_CSRF_ROUTE_KEY = 'qaeh:is_prelogin_csrf_route';

export interface AuthenticatedActor {
  readonly ownerId: string;
  readonly loginIdentifier: string;
  readonly timezone: string;
  readonly sessionId: string;
}

export interface AuthenticatedSessionContext {
  readonly id: string;
  readonly csrfSalt: string;
  readonly rawToken: string;
  readonly expiresAt: Date;
}

export interface AuthenticatedRequest extends Request {
  authenticatedActor?: AuthenticatedActor;
  authenticatedSession?: AuthenticatedSessionContext;
}

export const Public = () => SetMetadata(IS_PUBLIC_ROUTE_KEY, true);

export const PublicHealth = () =>
  applyDecorators(
    SetMetadata(IS_PUBLIC_ROUTE_KEY, true),
    SetMetadata(IS_HEALTH_PUBLIC_ROUTE_KEY, true),
  );

export const PreLoginCsrfRoute = () => SetMetadata(IS_PRELOGIN_CSRF_ROUTE_KEY, true);

export function extractActorFromContext(ctx: ExecutionContext): AuthenticatedActor | undefined {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return req.authenticatedActor;
}

export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedActor | undefined =>
    extractActorFromContext(ctx),
);
