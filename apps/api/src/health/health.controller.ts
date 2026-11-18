import { Controller, Get, Header, HttpStatus, Inject, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  EmptyQueryDto,
  LivenessResponseDto,
  ReadinessOkResponseDto,
  ReadinessUnavailableResponseDto,
} from './health.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'getHealth',
    summary: 'Check API process liveness',
  })
  @ApiOkResponse({
    description: 'API process is live',
    type: LivenessResponseDto,
  })
  public getHealth(@Query() _query: EmptyQueryDto): LivenessResponseDto {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    operationId: 'getHealthReadiness',
    summary: 'Check API database readiness via bounded SELECT 1',
  })
  @ApiOkResponse({
    description: 'API and PostgreSQL connection are ready',
    type: ReadinessOkResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'API cannot verify PostgreSQL readiness',
    type: ReadinessUnavailableResponseDto,
  })
  public async getReadiness(
    @Query() _query: EmptyQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessOkResponseDto | ReadinessUnavailableResponseDto> {
    const result = await this.healthService.getReadiness();
    response.status(result.ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result.body;
  }
}
