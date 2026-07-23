import { Lunar, LunarYear, Solar } from 'lunar-javascript';
import type { DateInput, LunarDate } from './types';
import { parseGregorianDate } from './utils';
import { validateGregorianDate } from './validation';

/**
 * Converts a Gregorian date input to a structured Chinese Lunar date.
 * Throws an error if the Gregorian date is invalid.
 */
export function gregorianToLunar(input: DateInput): LunarDate {
  const validation = validateGregorianDate(input);
  if (!validation.isValid) {
    throw new Error(`Cannot convert invalid Gregorian date to Lunar: ${validation.errors.join('; ')}`);
  }

  const parsed = parseGregorianDate(input)!;
  const solar = Solar.fromYmd(parsed.year, parsed.month, parsed.day);
  const lunar = solar.getLunar();

  const rawMonth = lunar.getMonth();
  const isLeap = rawMonth < 0 || lunar.getMonthInChinese().startsWith('闰');
  const month = Math.abs(rawMonth);

  return {
    year: lunar.getYear(),
    month,
    day: lunar.getDay(),
    isLeap,
    yearGanZhi: lunar.getYearInGanZhi(),
    yearShengXiao: lunar.getYearShengXiao(),
    monthInChinese: lunar.getMonthInChinese(),
    dayInChinese: lunar.getDayInChinese(),
  };
}

/**
 * Gets the Chinese Lunar year for a given Gregorian date.
 */
export function getLunarYear(input: DateInput): number {
  const lunarDate = gregorianToLunar(input);
  return lunarDate.year;
}

/**
 * Gets the Chinese Lunar month (1-12) for a given Gregorian date.
 */
export function getLunarMonth(input: DateInput): number {
  const lunarDate = gregorianToLunar(input);
  return lunarDate.month;
}

/**
 * Gets the Chinese Lunar day (1-30) for a given Gregorian date.
 */
export function getLunarDay(input: DateInput): number {
  const lunarDate = gregorianToLunar(input);
  return lunarDate.day;
}

/**
 * Checks whether a given Gregorian date falls within a Chinese Lunar leap month.
 */
export function isLeapMonth(input: DateInput): boolean {
  const lunarDate = gregorianToLunar(input);
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

  const lunarYearObj = LunarYear.fromYear(lunarYear);
  return lunarYearObj.getLeapMonth();
}
