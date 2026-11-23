const LOCAL_DATETIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

interface WallClockParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function resolveSafeTimeZone(rawTimeZone: string | undefined): string {
  const candidate = rawTimeZone?.trim();
  if (!candidate) {
    return 'UTC';
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate });
    return candidate;
  } catch {
    return 'UTC';
  }
}

function extractWallClockInTimeZone(instantMs: number, timeZone: string): WallClockParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(new Date(instantMs));
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    switch (part.type) {
      case 'year':
        year = Number(part.value);
        break;
      case 'month':
        month = Number(part.value);
        break;
      case 'day':
        day = Number(part.value);
        break;
      case 'hour':
        hour = Number(part.value) === 24 ? 0 : Number(part.value);
        break;
      case 'minute':
        minute = Number(part.value);
        break;
      case 'second':
        second = Number(part.value);
        break;
      default:
        break;
    }
  }

  return { year, month, day, hour, minute, second };
}

function getTimeZoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = extractWallClockInTimeZone(instantMs, timeZone);
  const wallAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const truncatedInstantMs = Math.floor(instantMs / 1000) * 1000;
  return wallAsUtcMs - truncatedInstantMs;
}

export function formatUtcInTimeZone(
  utcIsoString: string,
  rawTimeZone: string | undefined,
): string {
  const parsed = new Date(utcIsoString);
  const safeTz = resolveSafeTimeZone(rawTimeZone);
  if (Number.isNaN(parsed.getTime())) {
    return utcIsoString;
  }
  const parts = extractWallClockInTimeZone(parsed.getTime(), safeTz);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)} (${safeTz})`;
}

export function localDateTimeToUtcIso(
  localValue: string,
  rawTimeZone: string | undefined,
): string | null {
  if (typeof localValue !== 'string') {
    return null;
  }
  const match = LOCAL_DATETIME_REGEX.exec(localValue.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] !== undefined ? Number(match[6]) : 0;

  if (month < 1 || month > 12) {
    return null;
  }
  if (day < 1 || day > daysInGregorianMonth(year, month)) {
    return null;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const safeTz = resolveSafeTimeZone(rawTimeZone);
  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstPassMs = utcGuessMs - getTimeZoneOffsetMs(utcGuessMs, safeTz);
  const secondPassMs = utcGuessMs - getTimeZoneOffsetMs(firstPassMs, safeTz);

  const roundTrip = extractWallClockInTimeZone(secondPassMs, safeTz);
  if (
    roundTrip.year !== year ||
    roundTrip.month !== month ||
    roundTrip.day !== day ||
    roundTrip.hour !== hour ||
    roundTrip.minute !== minute ||
    roundTrip.second !== second
  ) {
    // Reject nonexistent local times during spring-forward DST gaps.
    return null;
  }

  return new Date(secondPassMs).toISOString();
}
