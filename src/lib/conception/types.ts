import type { DateInput, GregorianDate, LunarDate } from '../calendar/types';

export type PredictedGenderTitle = 'Boy' | 'Girl';
export type PredictedGenderLower = 'boy' | 'girl';

/**
 * Standard error codes for Conception Gender Predictor validation and calculation failures.
 */
export type ConceptionErrorCode =
  | 'MISSING_BIRTH_DATE'
  | 'MISSING_CONCEPTION_DATE'
  | 'INVALID_BIRTH_DATE'
  | 'INVALID_CONCEPTION_DATE'
  | 'CONCEPTION_BEFORE_BIRTH'
  | 'UNDERAGE_MOTHER'
  | 'AGE_EXCEEDS_CHART'
  | 'DATE_OUT_OF_RANGE'
  | 'CHART_DATA_UNAVAILABLE'
  | 'CALCULATION_ERROR';

/**
 * Structured error details for validation or calculation failures.
 */
export interface ConceptionErrorDetail {
  code: ConceptionErrorCode;
  message: string;
  field?: 'motherBirthDate' | 'conceptionDate' | 'general';
}

/**
 * Input parameters for the Chinese Gender Predictor by Conception Date.
 */
export interface ConceptionPredictionInput {
  motherBirthDate: DateInput;
  conceptionDate: DateInput;
  /**
   * Optional configuration.
   * strictAgeRange: if true, rejects lunar age < 18 or > 45 instead of clamping to [18, 45].
   * Defaults to false (clamped with boundary note).
   */
  strictAgeRange?: boolean;
}

/**
 * Detailed lunar context returned on successful prediction.
 */
export interface ConceptionPredictionDetails {
  birthDate: string; // Gregorian ISO (YYYY-MM-DD)
  conceptionDate: string; // Gregorian ISO (YYYY-MM-DD)
  lunarBirthDate: string; // Formatted Chinese lunar birth date
  lunarConceptionDate: string; // Formatted Chinese lunar conception date
  lunarBirthYearGanZhi: string; // Heavenly stem and Earthly branch (e.g. "乙亥")
  lunarConceptionYearGanZhi: string; // (e.g. "丙午")
  lunarBirthZodiac: string; // Chinese zodiac animal name in English (e.g. "Pig")
  lunarBirthZodiacChinese: string; // Chinese zodiac animal character (e.g. "猪")
  lunarConceptionZodiac: string; // Chinese zodiac animal name in English (e.g. "Horse")
  lunarConceptionZodiacChinese: string; // Chinese zodiac animal character (e.g. "马")
  lunarConceptionMonthName: string; // Chinese month name (e.g. "正月", "二月", "闰四月")
  lunarConceptionDayName: string; // Chinese day name (e.g. "初一", "十五")
  isLeapMonth: boolean;
  ageClamped?: boolean;
  disclaimer: string;
}

/**
 * Successful prediction response contract.
 */
export interface ConceptionPredictionSuccess {
  success: true;
  prediction: PredictedGenderTitle;
  lunarAge: number;
  lunarConceptionMonth: number;
  lunarBirthYear: number;
  lunarConceptionYear: number;
  details: ConceptionPredictionDetails;
}

/**
 * Failure response contract.
 */
export interface ConceptionPredictionFailure {
  success: false;
  error: ConceptionErrorDetail;
}

/**
 * Discriminated union response returned by the central prediction engine.
 */
export type ConceptionPredictionResult = ConceptionPredictionSuccess | ConceptionPredictionFailure;

/**
 * Validation result for date inputs before calculation.
 */
export type ConceptionValidationResult =
  | {
      isValid: true;
      birthDate: GregorianDate;
      conceptionDate: GregorianDate;
      formattedBirthDate: string;
      formattedConceptionDate: string;
    }
  | {
      isValid: false;
      error: ConceptionErrorDetail;
    };

/**
 * Structured result of Lunar Conception Month extraction.
 */
export interface LunarConceptionMonthResult {
  lunarYear: number;
  lunarMonth: number; // 1-12
  lunarDay: number;   // 1-30
  isLeapMonth: boolean;
  monthNameChinese: string;
  dayNameChinese: string;
  yearGanZhi: string;
  yearZodiac: string;
  yearZodiacChinese: string;
  formattedLunarDate: string;
  rawLunarDate: LunarDate;
}
