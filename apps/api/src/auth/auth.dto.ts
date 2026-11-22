import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class CsrfTokenResponseDto {
  @ApiProperty({ example: 'dG9rZW4tZXhhbXBsZS1vcGFxdWUtY3NyZg' })
  public csrfToken!: string;
}

export class LoginRequestDto {
  @ApiProperty({ example: 'owner@example.test', maxLength: 200 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  public loginIdentifier!: string;

  @ApiProperty({ example: '••••••••••••', maxLength: 1024 })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  public password!: string;
}

export class OwnerSummaryDto {
  @ApiProperty({ example: '11111111-2222-4333-8444-555555555555' })
  @IsString()
  public id!: string;

  @ApiProperty({ example: 'owner@example.test' })
  @IsString()
  public loginIdentifier!: string;

  @ApiProperty({ example: 'Europe/Bratislava' })
  @IsString()
  public timezone!: string;
}

export class LoginResponseDto {
  @ApiProperty({ enum: [true], example: true })
  @IsBoolean()
  public authenticated!: true;

  @ApiProperty({ type: OwnerSummaryDto })
  public owner!: OwnerSummaryDto;

  @ApiProperty({ example: 'Y2hhbmdlZC1hdXRoZW50aWNhdGVkLWNzcmYtdG9rZW4' })
  @IsString()
  public csrfToken!: string;
}

export class SessionStatusResponseDto {
  @ApiProperty({ enum: [true], example: true })
  @IsBoolean()
  public authenticated!: true;

  @ApiProperty({ type: OwnerSummaryDto })
  public owner!: OwnerSummaryDto;
}

export class LogoutResponseDto {
  @ApiProperty({ enum: [false], example: false })
  @IsBoolean()
  public authenticated!: false;
}

export class EmptyBodyDto {}
