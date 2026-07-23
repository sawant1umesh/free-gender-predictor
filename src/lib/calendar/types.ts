/**
 * Represents a normalized Gregorian calendar date.
 */
export interface GregorianDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
}

/**
 * Flexible input type accepted by calendar engine functions.
 */
export type DateInput = GregorianDate | Date | string;

/**
 * Represents a Chinese Lunar calendar date.
 */
export interface LunarDate {
  year: number;
  month: number; // 1-12 (positive lunar month number)
  day: number;   // 1-30
  isLeap: boolean; // True if this month is a leap month (闰月)
  yearGanZhi: string; // Heavenly Stems & Earthly Branches (e.g. 乙亥)
  yearShengXiao: string; // Chinese Zodiac Animal (e.g. 猪)
  monthInChinese: string; // Chinese month name (e.g. 正月, 闰四月)
  dayInChinese: string;   // Chinese day name (e.g. 初一, 十五)
}

/**
 * Result of Gregorian date validation.
 */
export interface DateValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Result of Chinese Lunar Age calculation.
 */
export interface LunarAgeResult {
  birthLunarYear: number;
  targetLunarYear: number;
  lunarAge: number;
}
