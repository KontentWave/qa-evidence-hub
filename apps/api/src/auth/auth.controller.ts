import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { EmptyQueryDto } from '../health/health.dto';
import {
  type AuthenticatedActor,
  CurrentActor,
  PreLoginCsrfRoute,
  Public,
} from './auth.decorators';
import {
  CsrfTokenResponseDto,
  EmptyBodyDto,
  LoginRequestDto,
  LoginResponseDto,
  LogoutResponseDto,
  SessionStatusResponseDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import {
  CsrfService,
  PRELOGIN_CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from './csrf.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(CsrfService) private readonly csrfService: CsrfService,
  ) {}

  @Public()
  @Get('csrf')
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'getAuthCsrfToken',
    summary: 'Bootstrap browser-bound pre-login or session-bound anti-CSRF token',
  })
  @ApiOkResponse({
    description: 'Browser-bound anti-CSRF token',
    type: CsrfTokenResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Insecure transport rejected when HTTPS origin is configured',
  })
  public async getCsrfToken(
    @Query() _query: EmptyQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CsrfTokenResponseDto> {
    const cookies = this.csrfService.parseCookies(request.headers.cookie);
    const result = await this.authService.bootstrapCsrf({
      rawSessionToken: cookies.get(SESSION_COOKIE_NAME),
      preLoginCookieValue: cookies.get(PRELOGIN_CSRF_COOKIE_NAME),
    });

    if (result.kind === 'prelogin' && result.newPreLoginCookieValue) {
      response.cookie(
        PRELOGIN_CSRF_COOKIE_NAME,
        result.newPreLoginCookieValue,
        this.csrfService.buildPreLoginCookieOptions(),
      );
    }

    return { csrfToken: result.csrfToken };
  }

  @Public()
  @PreLoginCsrfRoute()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'loginOwner',
    summary: 'Authenticate the provisioned single owner and issue a fresh session cookie',
  })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Browser-bound anti-CSRF token obtained from GET /api/v1/auth/csrf',
  })
  @ApiOkResponse({
    description: 'Owner authenticated; fresh session cookie and authenticated CSRF token issued',
    type: LoginResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid login payload or undeclared DTO fields' })
  @ApiUnauthorizedResponse({ description: 'Generic authentication failure' })
  @ApiForbiddenResponse({ description: 'Missing or invalid Origin or X-CSRF-Token' })
  @ApiTooManyRequestsResponse({ description: 'Bounded login rate limit exceeded' })
  public async login(
    @Query() _query: EmptyQueryDto,
    @Body() body: LoginRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const cookies = this.csrfService.parseCookies(request.headers.cookie);
    const clientIp = request.ip || request.socket.remoteAddress || 'unknown';

    const result = await this.authService.login({
      loginIdentifier: body.loginIdentifier,
      password: body.password,
      clientIp,
      previousSessionToken: cookies.get(SESSION_COOKIE_NAME),
    });

    response.cookie(
      SESSION_COOKIE_NAME,
      result.rawSessionToken,
      this.csrfService.buildSessionCookieOptions(result.sessionTtlSeconds),
    );
    response.cookie(PRELOGIN_CSRF_COOKIE_NAME, '', this.csrfService.buildClearCookieOptions());

    return {
      authenticated: true,
      owner: result.owner,
      csrfToken: result.csrfToken,
    };
  }

  @Get('session')
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'getAuthSession',
    summary: 'Read-only authenticated owner session lookup (emits zero Set-Cookie headers)',
  })
  @ApiOkResponse({
    description: 'Active authenticated owner session summary',
    type: SessionStatusResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing, expired, or revoked session' })
  public getSession(
    @Query() _query: EmptyQueryDto,
    @CurrentActor() actor: AuthenticatedActor | undefined,
  ): SessionStatusResponseDto {
    return this.authService.getSessionView(actor);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'logoutOwner',
    summary: 'Invalidate the current owner session and clear browser auth cookies',
  })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Session-bound anti-CSRF token',
  })
  @ApiOkResponse({
    description: 'Session invalidated and cookie cleared',
    type: LogoutResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Missing or invalid Origin or X-CSRF-Token' })
  public async logout(
    @Query() _query: EmptyQueryDto,
    @Body() _body: EmptyBodyDto,
    @CurrentActor() actor: AuthenticatedActor | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponseDto> {
    const result = await this.authService.logout(actor);
    response.cookie(SESSION_COOKIE_NAME, '', this.csrfService.buildClearCookieOptions());
    response.cookie(PRELOGIN_CSRF_COOKIE_NAME, '', this.csrfService.buildClearCookieOptions());
    return result;
  }
}
