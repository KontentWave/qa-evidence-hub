import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RequestValidationException } from './http-exception.filter';
import {
  assertAuthorizedDomainActor,
  assertValidUuidField,
  normalizeOptionalTextField,
  normalizeRequiredTextField,
  parseStrictIntegerQuery,
  parseStrictIsoInstant,
  parseStrictIsoTimestamp,
  trimOptionalTextToNull,
  trimRequiredText,
} from './validation.util';

describe('validation.util', () => {
  it('trims required and optional strings while preserving non-string values for validator rejection', () => {
    expect(trimRequiredText('  Hello  ')).toBe('Hello');
    expect(trimRequiredText(42)).toBe(42);

    expect(trimOptionalTextToNull(undefined)).toBeNull();
    expect(trimOptionalTextToNull(null)).toBeNull();
    expect(trimOptionalTextToNull('   \n\t  ')).toBeNull();
    expect(trimOptionalTextToNull('  Some note  ')).toBe('Some note');
    expect(trimOptionalTextToNull(123)).toBe(123);

    expect(parseStrictIntegerQuery(undefined)).toBeUndefined();
    expect(parseStrictIntegerQuery(50)).toBe(50);
    expect(parseStrictIntegerQuery('  200  ')).toBe(200);
    expect(parseStrictIntegerQuery('-5')).toBe(-5);
    expect(parseStrictIntegerQuery('12.5')).toBe('12.5');
    expect(parseStrictIntegerQuery('abc')).toBe('abc');
    expect(parseStrictIntegerQuery(['10'])).toEqual(['10']);
  });

  it('parses valid ISO-8601 timestamps with Z or numeric offsets and rejects calendar rollovers or missing offsets', () => {
    expect(parseStrictIsoTimestamp('2026-10-06T09:00:00Z')?.toISOString()).toBe(
      '2026-10-06T09:00:00.000Z',
    );
    expect(parseStrictIsoTimestamp('2026-10-06T11:00:00+02:00')?.toISOString()).toBe(
      '2026-10-06T09:00:00.000Z',
    );
    expect(parseStrictIsoTimestamp('2024-02-29T23:59:59.125-05:00')?.toISOString()).toBe(
      '2024-03-01T04:59:59.125Z',
    );
    expect(parseStrictIsoTimestamp('2026-04-30T08:15Z')?.toISOString()).toBe(
      '2026-04-30T08:15:00.000Z',
    );

    // Non-leap Feb 29, Apr 31, month 13, missing timezone offset, invalid clock/offset bounds
    expect(parseStrictIsoTimestamp(null)).toBeNull();
    expect(parseStrictIsoTimestamp('2026-02-29T09:00:00Z')).toBeNull();
    expect(parseStrictIsoTimestamp('2026-04-31T09:00:00Z')).toBeNull();
    expect(parseStrictIsoTimestamp('2026-13-01T09:00:00Z')).toBeNull();
    expect(parseStrictIsoTimestamp('2026-10-06T09:00:00')).toBeNull();
    expect(parseStrictIsoTimestamp('2026-10-06T24:00:00Z')).toBeNull();
    expect(parseStrictIsoTimestamp('2026-10-06T09:00:00+25:00')).toBeNull();
    expect(parseStrictIsoTimestamp('2000-02-29T12:00:00Z')?.toISOString()).toBe(
      '2000-02-29T12:00:00.000Z',
    );
    expect(parseStrictIsoTimestamp('1900-02-29T12:00:00Z')).toBeNull();
    expect(parseStrictIsoTimestamp('0000-01-01T00:00:00Z')).toBeNull();
    expect(parseStrictIsoTimestamp('2026-11-27T10:00:00.1234567Z')).toBeNull();

    // Preserves normalized microsecond ordering and offset equivalence before JS Date conversion
    const laterMicros = parseStrictIsoInstant('2026-11-27T10:00:00.123900Z');
    const earlierMicros = parseStrictIsoInstant('2026-11-27T10:00:00.123100Z');
    expect(laterMicros).not.toBeNull();
    expect(earlierMicros).not.toBeNull();
    expect(earlierMicros!.epochMicros < laterMicros!.epochMicros).toBe(true);
    expect(laterMicros!.epochMicros - earlierMicros!.epochMicros).toBe(800n);
    expect(laterMicros!.date.toISOString()).toBe('2026-11-27T10:00:00.123Z');
    expect(earlierMicros!.date.toISOString()).toBe('2026-11-27T10:00:00.123Z');

    const plusTwoInstant = parseStrictIsoInstant('2026-11-27T12:00:00.123456+02:00');
    const minusFiveThirtyInstant = parseStrictIsoInstant('2026-11-27T04:30:00.123456-05:30');
    expect(plusTwoInstant?.epochMicros).toBe(minusFiveThirtyInstant?.epochMicros);

    const preEpochMicros = parseStrictIsoInstant('1969-12-31T23:59:59.123900Z');
    expect(preEpochMicros?.epochMicros).toBe(-876_100n);
    expect(preEpochMicros?.date.toISOString()).toBe('1969-12-31T23:59:59.123Z');
  });

  it('enforces actor, UUID, and required/optional text field normalization invariants', () => {
    expect(() => assertAuthorizedDomainActor(undefined)).toThrow(UnauthorizedException);
    expect(() =>
      assertAuthorizedDomainActor({
        ownerId: '',
        loginIdentifier: 'owner@test',
        timezone: 'Europe/Bratislava',
        sessionId: 'sess',
      }),
    ).toThrow(UnauthorizedException);

    expect(() => assertValidUuidField('clientId', 'not-a-uuid')).toThrow(
      RequestValidationException,
    );
    expect(assertValidUuidField('clientId', '11111111-2222-4333-8444-555555555555')).toBe(
      '11111111-2222-4333-8444-555555555555',
    );

    expect(() => normalizeRequiredTextField('name', '   ', 200)).toThrow(
      RequestValidationException,
    );
    expect(() => normalizeRequiredTextField('name', 'x'.repeat(201), 200)).toThrow(
      RequestValidationException,
    );
    expect(normalizeRequiredTextField('name', '  Client  ', 200)).toBe('Client');

    expect(normalizeOptionalTextField('notes', undefined, 20)).toBeNull();
    expect(normalizeOptionalTextField('notes', '   ', 20)).toBeNull();
    expect(normalizeOptionalTextField('notes', '  ok  ', 20)).toBe('ok');
    expect(() => normalizeOptionalTextField('notes', 'x'.repeat(21), 20)).toThrow(
      RequestValidationException,
    );
    expect(() =>
      normalizeOptionalTextField('notes', 99 as unknown as string, 20),
    ).toThrow(RequestValidationException);
  });
});
