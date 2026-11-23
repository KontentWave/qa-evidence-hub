import { describe, expect, it } from 'vitest';
import {
  formatUtcInTimeZone,
  localDateTimeToUtcIso,
  resolveSafeTimeZone,
} from './timezone';

describe('timezone utilities', () => {
  it('resolves valid IANA timezones and falls back safely to UTC on blank or invalid names', () => {
    expect(resolveSafeTimeZone('Europe/Bratislava')).toBe('Europe/Bratislava');
    expect(resolveSafeTimeZone('')).toBe('UTC');
    expect(resolveSafeTimeZone(undefined)).toBe('UTC');
    expect(resolveSafeTimeZone('Invalid/Timezone_Name')).toBe('UTC');
  });

  it('formats UTC ISO timestamps deterministically in the owner timezone across summer and winter offsets', () => {
    // Summer CEST (UTC+2)
    expect(formatUtcInTimeZone('2026-10-06T09:00:00.000Z', 'Europe/Bratislava')).toBe(
      '2026-10-06 11:00 (Europe/Bratislava)',
    );
    // Winter CET (UTC+1)
    expect(formatUtcInTimeZone('2026-11-23T09:00:00.000Z', 'Europe/Bratislava')).toBe(
      '2026-11-23 10:00 (Europe/Bratislava)',
    );
    // Invalid date string echoes safely without throwing
    expect(formatUtcInTimeZone('not-a-date', 'Europe/Bratislava')).toBe('not-a-date');
  });

  it('converts owner wall-clock datetime-local values to UTC ISO and rejects calendar rollovers or DST gaps', () => {
    expect(localDateTimeToUtcIso('2026-10-06T11:00', 'Europe/Bratislava')).toBe(
      '2026-10-06T09:00:00.000Z',
    );
    expect(localDateTimeToUtcIso('2026-11-23T10:30:15', 'Europe/Bratislava')).toBe(
      '2026-11-23T09:30:15.000Z',
    );

    // Invalid calendar dates or malformed inputs return null
    expect(localDateTimeToUtcIso('2026-02-29T10:00', 'Europe/Bratislava')).toBeNull();
    expect(localDateTimeToUtcIso('2026-04-31T10:00', 'Europe/Bratislava')).toBeNull();
    expect(localDateTimeToUtcIso('', 'Europe/Bratislava')).toBeNull();

    // Spring-forward DST gap in Europe/Bratislava (2026-03-29 jumps 02:00 -> 03:00)
    expect(localDateTimeToUtcIso('2026-03-29T02:30', 'Europe/Bratislava')).toBeNull();
  });
});
