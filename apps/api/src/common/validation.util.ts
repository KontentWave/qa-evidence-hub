import { UnauthorizedException } from '@nestjs/common';
import { registerDecorator, type ValidationOptions } from 'class-validator';
import type { AuthenticatedActor } from '../auth/auth.decorators';
import { RequestValidationException } from './http-exception.filter';

export const SHORT_TEXT_MAX_LENGTH = 200;
export const LONG_TEXT_MAX_LENGTH = 20_000;
export const DEFAULT_DOMAIN_LIST_LIMIT = 200;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRICT_ISO_TIMESTAMP_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|([+-])(\d{2}):(\d{2}))$/;

function daysInGregorianMonth(year: number, month: number): number {
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  switch (month) {
    case 2:
      return isLeapYear ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

export function trimRequiredText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function parseStrictIntegerQuery(value: unknown): unknown {
  if (value === undefined || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
  }
  return value;
}

export function trimOptionalTextToNull(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  return value;
}

export interface ParsedStrictIsoInstant {
  readonly date: Date;
  readonly epochMicros: bigint;
}

function floorDivMicrosToMillis(epochMicros: bigint): number {
  const quotient = epochMicros / 1000n;
  const remainder = epochMicros % 1000n;
  return Number(remainder < 0n ? quotient - 1n : quotient);
}

export function parseStrictIsoInstant(value: unknown): ParsedStrictIsoInstant | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = STRICT_ISO_TIMESTAMP_REGEX.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] !== undefined ? Number(match[6]) : 0;
  const rawFraction = match[7] ?? '';
  const tzToken = match[8];
  const offsetSign = match[9];
  const offsetHours = match[10] !== undefined ? Number(match[10]) : 0;
  const offsetMinutes = match[11] !== undefined ? Number(match[11]) : 0;

  if (year < 1 || month < 1 || month > 12) {
    return null;
  }
  const maxDay = daysInGregorianMonth(year, month);
  if (day < 1 || day > maxDay) {
    return null;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  if (tzToken !== 'Z' && (offsetHours > 23 || offsetMinutes > 59)) {
    return null;
  }

  const wallUtc = new Date(0);
  wallUtc.setUTCFullYear(year, month - 1, day);
  wallUtc.setUTCHours(hour, minute, second, 0);

  const microsPart = rawFraction.length > 0 ? BigInt(rawFraction.padEnd(6, '0')) : 0n;
  const offsetMicros =
    tzToken === 'Z'
      ? 0n
      : (offsetSign === '-' ? -1n : 1n) * BigInt(offsetHours * 60 + offsetMinutes) * 60_000_000n;
  const epochMicros = BigInt(wallUtc.getTime()) * 1000n + microsPart - offsetMicros;
  const date = new Date(floorDivMicrosToMillis(epochMicros));

  return { date, epochMicros };
}

export function parseStrictIsoTimestamp(value: unknown): Date | null {
  return parseStrictIsoInstant(value)?.date ?? null;
}

export function IsStrictIsoTimestamp(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    registerDecorator({
      name: 'isStrictIsoTimestamp',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return parseStrictIsoInstant(value) !== null;
        },
        defaultMessage(): string {
          return 'Must be a valid ISO-8601 date-time with explicit UTC or numeric offset.';
        },
      },
    });
  };
}

export function assertAuthorizedDomainActor(
  actor: AuthenticatedActor | undefined,
): asserts actor is AuthenticatedActor {
  if (!actor || !actor.ownerId || !actor.sessionId) {
    throw new UnauthorizedException();
  }
}

export function assertValidUuidField(field: string, value: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!UUID_REGEX.test(trimmed)) {
    throw new RequestValidationException([
      {
        field,
        issues: [`Property "${field}" failed "isUuid" validation.`],
      },
    ]);
  }
  return trimmed;
}

export function normalizeRequiredTextField(
  field: string,
  value: string,
  maxLength = SHORT_TEXT_MAX_LENGTH,
): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.length === 0) {
    throw new RequestValidationException([
      {
        field,
        issues: [`Property "${field}" failed "minLength" validation.`],
      },
    ]);
  }
  if (trimmed.length > maxLength) {
    throw new RequestValidationException([
      {
        field,
        issues: [`Property "${field}" failed "maxLength" validation.`],
      },
    ]);
  }
  return trimmed;
}

export function normalizeOptionalTextField(
  field: string,
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new RequestValidationException([
      {
        field,
        issues: [`Property "${field}" failed "isString" validation.`],
      },
    ]);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new RequestValidationException([
      {
        field,
        issues: [`Property "${field}" failed "maxLength" validation.`],
      },
    ]);
  }
  return trimmed;
}
