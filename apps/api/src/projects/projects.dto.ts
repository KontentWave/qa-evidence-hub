import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  LONG_TEXT_MAX_LENGTH,
  SHORT_TEXT_MAX_LENGTH,
  trimOptionalTextToNull,
  trimRequiredText,
} from '../common/validation.util';

export const PROJECT_STATUS_VALUES = ['Active', 'Archived'] as const;
export type ProjectStatusLiteral = (typeof PROJECT_STATUS_VALUES)[number];

export class ClientProjectParamsDto {
  @ApiProperty({ format: 'uuid', example: '11111111-2222-4333-8444-555555555555' })
  @IsUUID()
  public clientId!: string;

  @ApiProperty({ format: 'uuid', example: '22222222-3333-4444-8555-666666666666' })
  @IsUUID()
  public projectId!: string;
}

export class CreateProjectDto {
  @ApiProperty({ example: 'Checkout QA', minLength: 1, maxLength: SHORT_TEXT_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) => trimRequiredText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  public name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: LONG_TEXT_MAX_LENGTH,
    example: 'Checkout payment and order confirmation regression',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalTextToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  public description?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: LONG_TEXT_MAX_LENGTH,
    example: 'Staging sandbox with synthetic test cards',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalTextToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  public testingContext?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: LONG_TEXT_MAX_LENGTH,
    example: 'Capture viewport and build version on payment errors.',
  })
  @Transform(({ value }: { value: unknown }) => trimOptionalTextToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  public instructions?: string | null;
}

export class ProjectDto {
  @ApiProperty({ format: 'uuid', example: '22222222-3333-4444-8555-666666666666' })
  @IsUUID()
  public id!: string;

  @ApiProperty({ format: 'uuid', example: '11111111-2222-4333-8444-555555555555' })
  @IsUUID()
  public clientId!: string;

  @ApiProperty({ example: 'Checkout QA' })
  @IsString()
  public name!: string;

  @ApiProperty({ enum: PROJECT_STATUS_VALUES, example: 'Active' })
  @IsIn(PROJECT_STATUS_VALUES)
  public status!: ProjectStatusLiteral;

  @ApiProperty({ type: String, nullable: true })
  public description!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public testingContext!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public instructions!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-10-06T09:00:00.000Z' })
  @IsString()
  public createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-06T09:00:00.000Z' })
  @IsString()
  public updatedAt!: string;
}

export class ProjectListResponseDto {
  @ApiProperty({ type: [ProjectDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectDto)
  public items!: ProjectDto[];
}
