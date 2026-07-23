import type { DateInput } from '../calendar/types';

export type PredictedGender = 'boy' | 'girl';

/**
 * Information regarding the mother's age and birth date context.
 */
export interface MotherPredictionInfo {
  gregorianBirthDate: string; // YYYY-MM-DD
  lunarBirthYear: number;
  lunarAge: number; // Chinese Lunar Age (虚岁)
}

/**
 * Monthly prediction details for a specific lunar month in the target year.
 */
export interface PredictionMonth {
  lunarMonth: number; // 1-12
  lunarMonthName: string; // e.g. "正月初一 - 正月廿九"
  monthNameChinese: string; // e.g. "正月", "闰四月"
  isLeap: boolean; // True if this is a leap lunar month
  gregorianStart: string; // YYYY-MM-DD
  gregorianEnd: string; // YYYY-MM-DD
  predictedGender: PredictedGender;
  score: number; // Suitability score (e.g. 85-98)
  recommendation: string; // Actionable recommendation description
}

/**
 * Optimal conception window result for a target gender.
 */
export interface BestWindowResult {
  lunarMonth: number;
  monthName: string;
  gregorianStart: string;
  gregorianEnd: string;
  score: number;
  description: string;
}

/**
 * Summary overview of the prediction year.
 */
export interface PredictionSummary {
  totalBoyMonths: number;
  totalGirlMonths: number;
  overallTrend: string; // e.g. "Boy-favorable year", "Balanced year"
  dominantGender: PredictedGender | 'balanced';
}

/**
 * Options for generating gender prediction.
 */
export interface PredictionOptions {
  motherBirthDate: DateInput;
  targetYear?: number; // Defaults to current Gregorian year
}

/**
 * Master result object returned by the Prediction Engine.
 */
export interface PredictionResult {
  targetYear: number;
  motherInfo: MotherPredictionInfo;
  bestGirl: BestWindowResult | null;
  bestBoy: BestWindowResult | null;
  summary: PredictionSummary;
  months: PredictionMonth[];
}
