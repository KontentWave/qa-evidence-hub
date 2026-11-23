import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  LONG_TEXT_MAX_LENGTH,
  SHORT_TEXT_MAX_LENGTH,
  trimOptionalTextToNull,
  trimRequiredText,
} from '../common/validation.util';

export class ClientIdParamDto {
  @ApiProperty({ format: 'uuid', example: '11111111-2222-4333-8444-555555555555' })
  @IsUUID()
  public clientId!: string;
}

export class CreateClientDto {
  @ApiProperty({ example: 'Example Client', minLength: 1, maxLength: SHORT_TEXT_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) => trimRequiredText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  public name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: LONG_TEXT_MAX_LENGTH,
    example: 'Synthetic engagement notes',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalTextToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  public notes?: string | null;
}

export class ClientDto {
  @ApiProperty({ format: 'uuid', example: '11111111-2222-4333-8444-555555555555' })
  @IsUUID()
  public id!: string;

  @ApiProperty({ example: 'Example Client' })
  @IsString()
  public name!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Synthetic engagement notes' })
  public notes!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-10-06T09:00:00.000Z' })
  @IsString()
  public createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-06T09:00:00.000Z' })
  @IsString()
  public updatedAt!: string;
}

export class ClientListResponseDto {
  @ApiProperty({ type: [ClientDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientDto)
  public items!: ClientDto[];
}
