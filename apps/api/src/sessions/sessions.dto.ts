import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  IsStrictIsoTimestamp,
  LONG_TEXT_MAX_LENGTH,
  SHORT_TEXT_MAX_LENGTH,
  trimOptionalTextToNull,
  trimRequiredText,
} from '../common/validation.util';

export class ProjectIdParamDto {
  @ApiProperty({ format: 'uuid', example: '22222222-3333-4444-8555-666666666666' })
  @IsUUID()
  public projectId!: string;
}

export class ProjectSessionParamsDto {
  @ApiProperty({ format: 'uuid', example: '22222222-3333-4444-8555-666666666666' })
  @IsUUID()
  public projectId!: string;

  @ApiProperty({ format: 'uuid', example: '33333333-4444-4555-8666-777777777777' })
  @IsUUID()
  public sessionId!: string;
}

export class CreateSessionDto {
  @ApiProperty({ example: 'Checkout regression', minLength: 1, maxLength: SHORT_TEXT_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) => trimRequiredText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  public purpose!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-06T09:00:00Z' })
  @Transform(({ value }: { value: unknown }) => trimRequiredText(value))
  @IsStrictIsoTimestamp()
  public startedAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
    example: '2026-10-06T10:30:00Z',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalTextToNull(value))
  @IsOptional()
  @IsStrictIsoTimestamp()
  public endedAt?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: SHORT_TEXT_MAX_LENGTH,
    example: 'staging',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalTextToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  public environment?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: SHORT_TEXT_MAX_LENGTH,
    example: 'Desktop',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalTextToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  public device?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: SHORT_TEXT_MAX_LENGTH,
    example: 'Linux',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalTextToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  public os?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: SHORT_TEXT_MAX_LENGTH,
    example: 'Firefox 132',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalTextToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  public browser?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: SHORT_TEXT_MAX_LENGTH,
    example: '2026.10.06-rc1',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalTextToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  public buildVersion?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: LONG_TEXT_MAX_LENGTH,
    example: 'Covered guest and signed-in checkout paths.',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalTextToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  public notes?: string | null;
}

export class SessionDto {
  @ApiProperty({ format: 'uuid', example: '33333333-4444-4555-8666-777777777777' })
  @IsUUID()
  public id!: string;

  @ApiProperty({ format: 'uuid', example: '22222222-3333-4444-8555-666666666666' })
  @IsUUID()
  public projectId!: string;

  @ApiProperty({ example: 'Checkout regression' })
  @IsString()
  public purpose!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-06T09:00:00.000Z' })
  @IsString()
  public startedAt!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  public endedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public environment!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public device!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public os!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public browser!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public buildVersion!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public notes!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-10-06T09:00:00.000Z' })
  @IsString()
  public createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-06T09:00:00.000Z' })
  @IsString()
  public updatedAt!: string;
}

export class SessionListResponseDto {
  @ApiProperty({ type: [SessionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionDto)
  public items!: SessionDto[];
}
