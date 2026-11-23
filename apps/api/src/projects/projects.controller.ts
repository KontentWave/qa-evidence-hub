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
import { ClientIdParamDto } from '../clients/clients.dto';
import { EmptyQueryDto } from '../health/health.dto';
import {
  ClientProjectParamsDto,
  CreateProjectDto,
  ProjectDto,
  ProjectListResponseDto,
} from './projects.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('clients/:clientId/projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'createClientProject',
    summary: 'Create an active project under the specified client',
  })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Session-bound anti-CSRF token',
  })
  @ApiCreatedResponse({ description: 'Project created as Active', type: ProjectDto })
  @ApiBadRequestResponse({ description: 'Validation failed or undeclared DTO fields supplied' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Missing or invalid Origin or X-CSRF-Token' })
  @ApiNotFoundResponse({ description: 'Parent client was not found' })
  public async createProject(
    @Param() params: ClientIdParamDto,
    @Query() _query: EmptyQueryDto,
    @Body() body: CreateProjectDto,
    @CurrentActor() actor: AuthenticatedActor | undefined,
  ): Promise<ProjectDto> {
    return this.projectsService.createProject(actor, params.clientId, body);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'listClientProjects',
    summary: 'List projects belonging to the specified client newest-first',
  })
  @ApiOkResponse({ description: 'Client project list', type: ProjectListResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid client ID format' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiNotFoundResponse({ description: 'Parent client was not found' })
  public async listProjects(
    @Param() params: ClientIdParamDto,
    @Query() _query: EmptyQueryDto,
    @CurrentActor() actor: AuthenticatedActor | undefined,
  ): Promise<ProjectListResponseDto> {
    return this.projectsService.listProjects(actor, params.clientId);
  }

  @Get(':projectId')
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'getClientProject',
    summary: 'Get project details scoped to its parent client',
  })
  @ApiOkResponse({ description: 'Project details', type: ProjectDto })
  @ApiBadRequestResponse({ description: 'Invalid client or project ID format' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiNotFoundResponse({ description: 'Client or project was not found, or parent mismatch' })
  public async getProject(
    @Param() params: ClientProjectParamsDto,
    @Query() _query: EmptyQueryDto,
    @CurrentActor() actor: AuthenticatedActor | undefined,
  ): Promise<ProjectDto> {
    return this.projectsService.getProject(actor, params.clientId, params.projectId);
  }
}
