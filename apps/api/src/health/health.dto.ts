import { ApiProperty } from '@nestjs/swagger';

export class EmptyQueryDto {}

export class LivenessResponseDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  public status!: 'ok';
}

export class ReadinessOkResponseDto {
  @ApiProperty({ enum: ['ready'], example: 'ready' })
  public status!: 'ready';
}

export class ReadinessUnavailableResponseDto {
  @ApiProperty({ enum: ['not_ready'], example: 'not_ready' })
  public status!: 'not_ready';
}
