import cnyDates from '../../data/cny-dates.json';
import lunarMonths from '../../data/lunar-months.json';
import type { DateInput, LunarDate } from './types';
import { formatGregorianDate, parseGregorianDate } from './utils';
import { validateGregorianDate } from './validation';

const lunarCache = new Map<string, LunarDate>();

// Pre-computed lookup: Gregorian date string → { lunarYear, lunarMonth, lunarDay, isLeap }
const gregorianLookup = new Map<string, { year: number; month: number; day: number; isLeap: boolean }>();

function buildLookup() {
  const cny = cnyDates as Record<string, string>;
  const months = lunarMonths as Record<string, any>;

  for (const [lunarYearStr, cnyDate] of Object.entries(cny)) {
    const lunarYear = Number(lunarYearStr);
    const yearData = months[lunarYear];
    if (!yearData) continue;

    for (const m of yearData.months) {
      const startParts = m.gregorianStart.split('-').map(Number);
      const endParts = m.gregorianEnd.split('-').map(Number);

      const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);
      const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!gregorianLookup.has(key)) {
          gregorianLookup.set(key, {
            year: lunarYear,
            month: m.absMonth,
            day: d.getDate() - (m.dayCount - m.dayCount) + 1, // day within lunar month
            isLeap: m.isLeap,
          });
        }
      }
    }
  }

  // Fill in the day-of-month by recomputing per-month
  for (const [lunarYearStr, yearData] of Object.entries(months)) {
    for (const m of yearData.months) {
      const startParts = m.gregorianStart.split('-').map(Number);
      const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);

      for (let dayOffset = 0; dayOffset < m.dayCount; dayOffset++) {
        const d = new Date(start);
        d.setDate(d.getDate() + dayOffset);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const entry = gregorianLookup.get(key);
        if (entry && entry.year === Number(lunarYearStr) && entry.month === m.absMonth && entry.isLeap === m.isLeap) {
          entry.day = dayOffset + 1;
        }
      }
    }
  }
}

buildLookup();

function getDateCacheKey(input: DateInput): string | null {
  if (typeof input === 'string') return input;
  if (input instanceof Date && !isNaN(input.getTime())) return formatGregorianDate(input);
  if (input && typeof input === 'object' && 'year' in input && 'month' in input && 'day' in input) {
    const { year, month, day } = input as { year: number; month: number; day: number };
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

function toKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Converts a Gregorian date input to a structured Chinese Lunar date.
 * Uses pre-computed lookup tables instead of lunar-javascript.
 */
export function gregorianToLunar(input: DateInput, skipValidation: boolean = false): LunarDate {
  const cacheKey = getDateCacheKey(input);
  if (cacheKey) {
    const cached = lunarCache.get(cacheKey);
    if (cached) return cached;
  }

  if (!skipValidation) {
    const validation = validateGregorianDate(input);
    if (!validation.isValid) {
      throw new Error(`Cannot convert invalid Gregorian date to Lunar: ${validation.errors.join('; ')}`);
    }
  }

  const parsed = parseGregorianDate(input)!;
  const key = toKey(parsed.year, parsed.month, parsed.day);
  const lookup = gregorianLookup.get(key);

  if (!lookup) {
    throw new Error(`Lunar data not available for ${key}. Supported range: 2020-2035.`);
  }

  const result: LunarDate = {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    isLeap: lookup.isLeap,
    yearGanZhi: '',
    yearShengXiao: '',
    monthInChinese: '',
    dayInChinese: '',
  };

  if (cacheKey) {
    lunarCache.set(cacheKey, result);
  }

  return result;
}

/**
 * Gets the Chinese Lunar year for a given Gregorian date.
 */
export function getLunarYear(input: DateInput, skipValidation: boolean = false): number {
  const lunarDate = gregorianToLunar(input, skipValidation);
  return lunarDate.year;
}

/**
 * Gets the Chinese Lunar month (1-12) for a given Gregorian date.
 */
export function getLunarMonth(input: DateInput, skipValidation: boolean = false): number {
  const lunarDate = gregorianToLunar(input, skipValidation);
  return lunarDate.month;
}

/**
 * Gets the Chinese Lunar day (1-30) for a given Gregorian date.
 */
export function getLunarDay(input: DateInput, skipValidation: boolean = false): number {
  const lunarDate = gregorianToLunar(input, skipValidation);
  return lunarDate.day;
}

/**
 * Checks whether a given Gregorian date falls within a Chinese Lunar leap month.
 */
export function isLeapMonth(input: DateInput, skipValidation: boolean = false): boolean {
  const lunarDate = gregorianToLunar(input, skipValidation);
  return lunarDate.isLeap;
}

/**
 * Retrieves the leap month number for a given Chinese Lunar Year.
 * Returns 0 if the specified lunar year has no leap month.
 */
export function getYearLeapMonth(lunarYear: number): number {
  if (!Number.isInteger(lunarYear) || lunarYear < 1 || lunarYear > 9999) {
    throw new Error(`Invalid Lunar year (${lunarYear}). Year must be an integer between 1 and 9999.`);
  }

  const yearData = (lunarMonths as Record<string, any>)[String(lunarYear)];
  return yearData ? yearData.leapMonth : 0;
}
