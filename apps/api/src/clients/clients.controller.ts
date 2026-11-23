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
import { EmptyQueryDto } from '../health/health.dto';
import {
  ClientDto,
  ClientIdParamDto,
  ClientListResponseDto,
  CreateClientDto,
} from './clients.dto';
import { ClientsService } from './clients.service';

@ApiTags('clients')
@Controller('clients')
export class ClientsController {
  constructor(@Inject(ClientsService) private readonly clientsService: ClientsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'createClient',
    summary: 'Create a client engagement container',
  })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Session-bound anti-CSRF token',
  })
  @ApiCreatedResponse({ description: 'Client created', type: ClientDto })
  @ApiBadRequestResponse({ description: 'Validation failed or undeclared DTO fields supplied' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Missing or invalid Origin or X-CSRF-Token' })
  public async createClient(
    @Query() _query: EmptyQueryDto,
    @Body() body: CreateClientDto,
    @CurrentActor() actor: AuthenticatedActor | undefined,
  ): Promise<ClientDto> {
    return this.clientsService.createClient(actor, body);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'listClients',
    summary: 'List clients newest-first',
  })
  @ApiOkResponse({ description: 'Client list', type: ClientListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  public async listClients(
    @Query() _query: EmptyQueryDto,
    @CurrentActor() actor: AuthenticatedActor | undefined,
  ): Promise<ClientListResponseDto> {
    return this.clientsService.listClients(actor);
  }

  @Get(':clientId')
  @Header('Cache-Control', 'private, no-store, no-transform')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'getClient',
    summary: 'Get client details by ID',
  })
  @ApiOkResponse({ description: 'Client details', type: ClientDto })
  @ApiBadRequestResponse({ description: 'Invalid client ID format' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiNotFoundResponse({ description: 'Client was not found' })
  public async getClient(
    @Param() params: ClientIdParamDto,
    @Query() _query: EmptyQueryDto,
    @CurrentActor() actor: AuthenticatedActor | undefined,
  ): Promise<ClientDto> {
    return this.clientsService.getClient(actor, params.clientId);
  }
}
