import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type AuthenticatedActor, CurrentActor } from '../auth/auth.decorators';
import { EmptyQueryDto } from '../health/health.dto';
import {
  CreateSessionDto,
  ListSessionsQueryDto,
  ProjectIdParamDto,
  ProjectSessionParamsDto,
  SessionDto,
  SessionListResponseDto,
} from './sessions.dto';
import { SessionsService } from './sessions.service';

@ApiTags('sessions')
@Controller('projects/:projectId/sessions')
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly sessionsService: SessionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'createProjectSession',
    summary: 'Create a test session under an active project',
  })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Session-bound anti-CSRF token',
  })
  @ApiCreatedResponse({ description: 'Test session created', type: SessionDto })
  @ApiBadRequestResponse({
    description: 'Validation failed (including invalid time range or undeclared DTO fields)',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Missing or invalid Origin or X-CSRF-Token' })
  @ApiNotFoundResponse({ description: 'Parent project was not found' })
  @ApiConflictResponse({ description: 'Parent project is archived and read-only' })
  public async createSession(
    @Param() params: ProjectIdParamDto,
    @Query() _query: EmptyQueryDto,
    @Body() body: CreateSessionDto,
    @CurrentActor() actor: AuthenticatedActor | undefined,
  ): Promise<SessionDto> {
    return this.sessionsService.createSession(actor, params.projectId, body);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'listProjectSessions',
    summary: 'List test sessions belonging to the specified project newest-first',
  })
  @ApiOkResponse({ description: 'Project test session list', type: SessionListResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid project ID, cursor, limit, or undeclared query parameter',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiNotFoundResponse({ description: 'Parent project was not found' })
  public async listSessions(
    @Param() params: ProjectIdParamDto,
    @Query() query: ListSessionsQueryDto,
    @CurrentActor() actor: AuthenticatedActor | undefined,
  ): Promise<SessionListResponseDto> {
    return this.sessionsService.listSessions(actor, params.projectId, query);
  }

  @Get(':sessionId')
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'getProjectSession',
    summary: 'Get test session details scoped to its parent project',
  })
  @ApiOkResponse({ description: 'Test session details', type: SessionDto })
  @ApiBadRequestResponse({ description: 'Invalid project or session ID format' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiNotFoundResponse({ description: 'Project or test session was not found, or parent mismatch' })
  public async getSession(
    @Param() params: ProjectSessionParamsDto,
    @Query() _query: EmptyQueryDto,
    @CurrentActor() actor: AuthenticatedActor | undefined,
  ): Promise<SessionDto> {
    return this.sessionsService.getSession(actor, params.projectId, params.sessionId);
  }
}
