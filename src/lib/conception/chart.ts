import { QING_GONG_BIAO_MATRIX } from '../predictor/constants';
import type { PredictedGenderTitle } from './types';
import { MAX_CHART_AGE, MIN_CHART_AGE } from './validation';

/**
 * Mapping of Chinese zodiac animal characters to English names.
 */
export const ZODIAC_CN_TO_EN: Record<string, string> = {
  鼠: 'Rat',
  牛: 'Ox',
  虎: 'Tiger',
  兔: 'Rabbit',
  龙: 'Dragon',
  蛇: 'Snake',
  马: 'Horse',
  羊: 'Goat',
  猴: 'Monkey',
  鸡: 'Rooster',
  狗: 'Dog',
  猪: 'Pig',
};

/**
 * Looks up the predicted gender in the authentic Qing Gong Biao (清宫表) chart
 * based on the mother's traditional Chinese lunar age (18 - 45) and lunar conception month (1 - 12).
 *
 * @param lunarAge Mother's Chinese lunar age (虚岁)
 * @param lunarMonth Chinese lunar conception month (1 - 12)
 * @param strict If true, rejects ages outside 18-45. If false (default), clamps age to boundary [18, 45].
 * @returns Object with prediction ('Boy' | 'Girl') and clamped flag, or null if strict validation fails.
 */
export function lookupConceptionGender(
  lunarAge: number,
  lunarMonth: number,
  strict: boolean = false
): { prediction: PredictedGenderTitle; isClamped: boolean } | null {
  const roundedAge = Math.round(lunarAge);
  const roundedMonth = Math.round(lunarMonth);

  // Month must be 1 to 12
  if (roundedMonth < 1 || roundedMonth > 12) {
    return null;
  }

  let effectiveAge = roundedAge;
  let isClamped = false;

  if (roundedAge < MIN_CHART_AGE || roundedAge > MAX_CHART_AGE) {
    if (strict) {
      return null;
    }
    effectiveAge = Math.max(MIN_CHART_AGE, Math.min(MAX_CHART_AGE, roundedAge));
    isClamped = true;
  }

  const row = QING_GONG_BIAO_MATRIX[effectiveAge];
  if (!row || !row[roundedMonth]) {
    return null;
  }

  const rawGender = row[roundedMonth];
  const prediction: PredictedGenderTitle = rawGender === 'boy' ? 'Boy' : 'Girl';

  return {
    prediction,
    isClamped,
  };
}
