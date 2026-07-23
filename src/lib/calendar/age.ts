import type { DateInput, LunarAgeResult } from './types';
import { getLunarYear } from './lunar';
import { validateBirthDate } from './validation';

/**
 * Calculates the traditional Chinese Lunar Age (虚岁 - Xūsuì).
 *
 * In traditional Chinese age reckoning:
 * 1. A person is considered 1 year old at birth.
 * 2. The person gains 1 year of age on each subsequent Chinese Lunar New Year.
 *
 * Formula: Chinese Lunar Age = (Target Lunar Year) - (Birth Lunar Year) + 1
 *
 * @param birthInput Gregorian birth date
 * @param targetInput Target reference date (defaults to current date)
 * @returns LunarAgeResult containing birthLunarYear, targetLunarYear, and lunarAge
 */
export function calculateLunarAge(
  birthInput: DateInput,
  targetInput: DateInput = new Date()
): LunarAgeResult {
  const validation = validateBirthDate(birthInput, targetInput);
  if (!validation.isValid) {
    throw new Error(`Invalid input for Lunar Age calculation: ${validation.errors.join('; ')}`);
  }

  const birthLunarYear = getLunarYear(birthInput);
  const targetLunarYear = getLunarYear(targetInput);

  const lunarAge = targetLunarYear - birthLunarYear + 1;

  if (lunarAge < 1) {
    throw new Error(
      `Calculated Lunar Age (${lunarAge}) is invalid. Birth Lunar Year (${birthLunarYear}) cannot exceed Target Lunar Year (${targetLunarYear}).`
    );
  }

  return {
    birthLunarYear,
    targetLunarYear,
    lunarAge,
  };
}
