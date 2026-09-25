import { calculateLunarAge } from '../calendar/age';
import { gregorianToLunar } from '../calendar/lunar';
import type { DateInput } from '../calendar/types';
import { formatGregorianDate } from '../calendar/utils';
import { lookupConceptionGender, ZODIAC_CN_TO_EN } from './chart';
import type {
  ConceptionPredictionInput,
  ConceptionPredictionResult,
  ConceptionPredictionSuccess,
  LunarConceptionMonthResult,
} from './types';
import { validateConceptionInput } from './validation';

const ENTERTAINMENT_DISCLAIMER =
  'The Chinese Gender Predictor is based on traditional Chinese folklore (Qing Gong Biao) and is intended for entertainment purposes only. It is not scientifically proven or medically accurate. For reliable baby gender determination, consult a qualified healthcare provider for ultrasound scans or genetic testing.';

/**
 * Extracts the Chinese Lunar Conception Month and associated lunar calendar metadata
 * from a Gregorian conception date.
 *
 * @param conceptionDate Gregorian conception date (string, Date, or GregorianDate object)
 * @returns Structured LunarConceptionMonthResult
 */
export function getLunarConceptionMonth(conceptionDate: DateInput): LunarConceptionMonthResult {
  const lunar = gregorianToLunar(conceptionDate);
  const zodiacCn = lunar.yearShengXiao;
  const zodiacEn = ZODIAC_CN_TO_EN[zodiacCn] || zodiacCn;
  const formattedLunarDate = `${lunar.year}年 (${lunar.yearGanZhi}) ${lunar.monthInChinese}${lunar.dayInChinese}`;

  return {
    lunarYear: lunar.year,
    lunarMonth: lunar.month,
    lunarDay: lunar.day,
    isLeapMonth: lunar.isLeap,
    monthNameChinese: lunar.monthInChinese,
    dayNameChinese: lunar.dayInChinese,
    yearGanZhi: lunar.yearGanZhi,
    yearZodiac: zodiacEn,
    yearZodiacChinese: zodiacCn,
    formattedLunarDate,
    rawLunarDate: lunar,
  };
}

/**
 * Calculates the mother's traditional Chinese Lunar Age (虚岁 - Xūsuì) at the time of conception.
 *
 * In traditional Chinese age reckoning:
 * - A newborn is considered 1 year old at birth.
 * - Age increments by +1 on each Chinese Lunar New Year (Spring Festival).
 * - Formula: Chinese Lunar Age = (Conception Lunar Year) - (Birth Lunar Year) + 1
 *
 * @param motherBirthDate Mother's Gregorian Date of Birth
 * @param conceptionDate Estimated Gregorian Conception Date
 * @returns Object containing birthLunarYear, conceptionLunarYear, and lunarAge
 */
export function calculateMotherLunarAgeAtConception(
  motherBirthDate: DateInput,
  conceptionDate: DateInput
): { birthLunarYear: number; conceptionLunarYear: number; lunarAge: number } {
  const ageResult = calculateLunarAge(motherBirthDate, conceptionDate);
  return {
    birthLunarYear: ageResult.birthLunarYear,
    conceptionLunarYear: ageResult.targetLunarYear,
    lunarAge: ageResult.lunarAge,
  };
}

/**
 * Central calculation function for the Chinese Gender Predictor by Conception Date.
 *
 * Accepts the mother's date of birth and estimated conception date, executes full validation,
 * computes astronomical Chinese lunar dates, calculates traditional Chinese lunar age (虚岁),
 * extracts the lunar conception month, and references the authentic Qing Gong Biao chart matrix.
 *
 * Returns a strongly typed discriminated union result:
 * - On success: { success: true, prediction: "Boy" | "Girl", lunarAge, lunarConceptionMonth, lunarBirthYear, lunarConceptionYear, details }
 * - On failure: { success: false, error: { code, message, field } }
 *
 * @param input ConceptionPredictionInput or object with motherBirthDate and conceptionDate strings
 * @returns ConceptionPredictionResult
 */
export function predictGenderByConception(input: ConceptionPredictionInput): ConceptionPredictionResult {
  try {
    // 1. Comprehensive input validation
    const validation = validateConceptionInput(input);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    const { birthDate, conceptionDate, formattedBirthDate, formattedConceptionDate } = validation;

    // 2. Astronomical Chinese Lunar conversions
    const birthLunar = gregorianToLunar(birthDate);
    const conceptionLunarResult = getLunarConceptionMonth(conceptionDate);

    const lunarBirthYear = birthLunar.year;
    const lunarConceptionYear = conceptionLunarResult.lunarYear;
    const lunarConceptionMonth = conceptionLunarResult.lunarMonth;

    // 3. Traditional Chinese Lunar Age calculation (Xūsuì)
    const lunarAge = lunarConceptionYear - lunarBirthYear + 1;

    if (lunarAge < 1) {
      return {
        success: false,
        error: {
          code: 'CALCULATION_ERROR',
          message: 'Unable to calculate lunar age: Conception lunar year precedes birth lunar year.',
          field: 'conceptionDate',
        },
      };
    }

    // 4. Look up prediction in the authentic Qing Gong Biao chart
    const strictAge = input.strictAgeRange ?? false;
    const chartLookup = lookupConceptionGender(lunarAge, lunarConceptionMonth, strictAge);

    if (!chartLookup) {
      return {
        success: false,
        error: {
          code: 'CHART_DATA_UNAVAILABLE',
          message: `Prediction chart data is unavailable for lunar age ${lunarAge} and lunar month ${lunarConceptionMonth}. Traditional chart supports lunar ages 18 to 45.`,
          field: 'motherBirthDate',
        },
      };
    }

    const birthZodiacCn = birthLunar.yearShengXiao;
    const birthZodiacEn = ZODIAC_CN_TO_EN[birthZodiacCn] || birthZodiacCn;
    const formattedLunarBirthDate = `${birthLunar.year}年 (${birthLunar.yearGanZhi}) ${birthLunar.monthInChinese}${birthLunar.dayInChinese}`;

    const successResult: ConceptionPredictionSuccess = {
      success: true,
      prediction: chartLookup.prediction,
      lunarAge,
      lunarConceptionMonth,
      lunarBirthYear,
      lunarConceptionYear,
      details: {
        birthDate: formattedBirthDate,
        conceptionDate: formattedConceptionDate,
        lunarBirthDate: formattedLunarBirthDate,
        lunarConceptionDate: conceptionLunarResult.formattedLunarDate,
        lunarBirthYearGanZhi: birthLunar.yearGanZhi,
        lunarConceptionYearGanZhi: conceptionLunarResult.yearGanZhi,
        lunarBirthZodiac: birthZodiacEn,
        lunarBirthZodiacChinese: birthZodiacCn,
        lunarConceptionZodiac: conceptionLunarResult.yearZodiac,
        lunarConceptionZodiacChinese: conceptionLunarResult.yearZodiacChinese,
        lunarConceptionMonthName: conceptionLunarResult.monthNameChinese,
        lunarConceptionDayName: conceptionLunarResult.dayNameChinese,
        isLeapMonth: conceptionLunarResult.isLeapMonth,
        ageClamped: chartLookup.isClamped,
        disclaimer: ENTERTAINMENT_DISCLAIMER,
      },
    };

    return successResult;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred during prediction calculation.';
    return {
      success: false,
      error: {
        code: 'CALCULATION_ERROR',
        message: errorMessage,
        field: 'general',
      },
    };
  }
}
