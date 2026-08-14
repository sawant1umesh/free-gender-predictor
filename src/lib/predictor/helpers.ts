import { formatLunarMonth } from '../calendar/utils';
import { MAX_LUNAR_AGE, MIN_LUNAR_AGE, QING_GONG_BIAO_MATRIX } from './constants';
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
export function getRecommendation(gender: PredictedGender, lunarMonth: number): string {
  const genderTitle = gender === 'boy' ? 'Boy' : 'Girl';
  return `Optimal conception window for conceiving a ${genderTitle} during ${formatLunarMonth(lunarMonth)}.`;
}
