import type { DateInput, GregorianDate } from './types';

const parsedDateCache = new Map<string, GregorianDate | null>();

/**
 * Returns the current Gregorian year.
 */
export function formatLunarMonth(lunarMonth: number): string {
  return `Lunar Month ${lunarMonth}`;
}

/**
 * Returns the current Gregorian year.
 */
export function getCurrentYear(): number {
  return new Date().getFullYear();
}
/**
 * Checks whether a given Gregorian year is a leap year.
 * Standard Gregorian leap year rule: divisible by 4, not 100 unless also divisible by 400.
 */
export function isLeapYear(year: number): boolean {
  if (!Number.isInteger(year)) {
    return false;
  }
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the number of days in a given Gregorian year and month (1-12).
 * Returns 0 if year/month are invalid.
 */
export function getDaysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return 0;
  }

  const daysPerMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysPerMonth[month - 1];
}

/**
 * Normalizes various date inputs (Date instance, YYYY-MM-DD string, or GregorianDate object)
 * into a structured GregorianDate object. Returns null if input cannot be parsed.
 * Results are cached by string key to avoid redundant regex and object construction.
 */
export function parseGregorianDate(input: DateInput): GregorianDate | null {
  if (!input) {
    return null;
  }

  // Cache string inputs by their literal value (most common case)
  if (typeof input === 'string') {
    const key = input.trim();
    if (parsedDateCache.has(key)) {
      return parsedDateCache.get(key)!;
    }
    const match = key.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    const result: GregorianDate | null = match ? { year: parseInt(match[1], 10), month: parseInt(match[2], 10), day: parseInt(match[3], 10) } : null;
    parsedDateCache.set(key, result);
    return result;
  }

  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      return null;
    }
    return {
      year: input.getFullYear(),
      month: input.getMonth() + 1,
      day: input.getDate(),
    };
  }

  if (typeof input === 'object' && input !== null) {
    const { year, month, day } = input as GregorianDate;
    if (
      typeof year === 'number' &&
      typeof month === 'number' &&
      typeof day === 'number'
    ) {
      return { year, month, day };
    }
  }

  return null;
}

/**
 * Formats a GregorianDate or Date object into ISO string format (YYYY-MM-DD).
 */
export function formatGregorianDate(input: DateInput): string {
  const parsed = parseGregorianDate(input);
  if (!parsed) {
    return '';
  }
  const y = String(parsed.year).padStart(4, '0');
  const m = String(parsed.month).padStart(2, '0');
  const d = String(parsed.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
