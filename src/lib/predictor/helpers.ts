import { Lunar, LunarYear } from 'lunar-javascript';
import type { LunarMonth } from 'lunar-javascript';
import { CHINESE_MONTH_NAMES, MAX_LUNAR_AGE, MIN_LUNAR_AGE, QING_GONG_BIAO_MATRIX } from './constants';
import type { PredictedGender } from './types';

/**
 * Looks up the predicted gender in the Qing Gong Biao matrix
 * for a given mother's Lunar Age and Chinese Lunar Month.
 */
export function lookupGenderChart(lunarAge: number, lunarMonth: number): PredictedGender {
  // Clamp lunar age between MIN_LUNAR_AGE and MAX_LUNAR_AGE
  let clampedAge = Math.round(lunarAge);
  if (clampedAge < MIN_LUNAR_AGE) {
    clampedAge = MIN_LUNAR_AGE;
  } else if (clampedAge > MAX_LUNAR_AGE) {
    clampedAge = MAX_LUNAR_AGE;
  }

  // Normalize month (1-12)
  let month = Math.abs(Math.round(lunarMonth));
  if (month < 1) month = 1;
  if (month > 12) month = 12;

  const ageMap = QING_GONG_BIAO_MATRIX[clampedAge];
  if (!ageMap || !ageMap[month]) {
    // Default fallback if boundary edge case occurs
    return month % 2 === 0 ? 'girl' : 'boy';
  }

  return ageMap[month];
}

/**
 * Computes the Gregorian start and end dates (YYYY-MM-DD) for a specific Lunar Month in a target Lunar Year.
 */
export function getLunarMonthGregorianRange(
  lunarYear: number,
  lunarMonthObj: LunarMonth
): { gregorianStart: string; gregorianEnd: string; dayCount: number; monthNameChinese: string } {
  const monthNum = lunarMonthObj.getMonth(); // negative if leap month
  const isLeap = lunarMonthObj.isLeap();
  const absMonth = Math.abs(monthNum);
  const dayCount = lunarMonthObj.getDayCount();

  // Create Lunar date for day 1 and last day
  const startLunar = Lunar.fromYmd(lunarYear, monthNum, 1);
  const endLunar = Lunar.fromYmd(lunarYear, monthNum, dayCount);

  const gregorianStart = startLunar.getSolar().toYmd();
  const gregorianEnd = endLunar.getSolar().toYmd();

  const baseName = CHINESE_MONTH_NAMES[absMonth] || `${absMonth}月`;
  const monthNameChinese = isLeap ? `闰${baseName}` : baseName;

  return {
    gregorianStart,
    gregorianEnd,
    dayCount,
    monthNameChinese,
  };
}

/**
 * Calculates suitability score rating (85 - 98%) based on month parameters.
 */
export function calculateWindowScore(gender: PredictedGender, lunarMonth: number, isLeap: boolean): number {
  let score = 90;
  if (lunarMonth === 1 || lunarMonth === 7 || lunarMonth === 12) {
    score += 5; // Peak seasonal months
  }
  if (isLeap) {
    score += 3; // Rare leap month bonus
  }
  return score;
}

/**
 * Formats a recommendation sentence for a predicted gender.
 */
export function getRecommendation(gender: PredictedGender, monthNameChinese: string): string {
  const genderTitle = gender === 'boy' ? 'Boy' : 'Girl';
  return `Optimal conception window for conceiving a ${genderTitle} during ${monthNameChinese}.`;
}
