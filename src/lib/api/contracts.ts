import type { DateInput } from '../calendar/types';
import type { PredictedGender, PredictionResult } from '../predictor/types';

/**
 * Input request payload for the Prediction API.
 */
export interface PredictionApiRequest {
  motherBirthDate: DateInput;
  targetYear?: number;
  locale?: string;
}

/**
 * Enriched system metadata regarding calculation engine, accuracy, and execution.
 */
export interface PredictionMetadata {
  engineVersion: string;
  calculatedAt: string; // ISO 8601 Timestamp
  methodology: string; // "Authentic Qing Gong Biao (清宫表) Lunar Algorithm"
  totalMonthsAnalyzed: number;
  accuracyDisclaimer: string;
}

/**
 * Pre-formatted View Model for Hero Calculator UI component.
 */
export interface HeroSummaryViewModel {
  targetYear: number;
  motherBirthDateFormatted: string; // e.g. "May 15, 1995" or "1995-05-15"
  motherLunarAge: number;
  motherLunarBirthYear: number;
  dominantGender: PredictedGender | 'balanced';
  dominantGenderBadgeText: string; // e.g. "Girl-leaning Year", "Boy-leaning Year"
  headlineSummary: string;
}

/**
 * Pre-formatted View Model for Best Window Summary Cards.
 */
export interface BestWindowCardViewModel {
  genderTarget: PredictedGender;
  available: boolean;
  lunarMonth: number;
  monthNameChinese: string;
  gregorianDateRange: string; // e.g. "Feb 17, 2026 - Mar 18, 2026"
  gregorianStart: string;
  gregorianEnd: string;
  scorePercentage: number; // e.g. 95
  recommendationBadgeText: string;
  recommendationDescription: string;
}

/**
 * Pre-formatted View Model for individual items in the 12-Month Calendar grid.
 */
export interface MonthCardViewModel {
  monthIndex: number; // 1 to 12
  lunarMonthNumber: number;
  lunarMonthNameChinese: string; // e.g. "正月", "闰四月"
  lunarDaySpanChinese: string; // e.g. "正月初一 - 正月廿九"
  isLeapMonth: boolean;
  gregorianStart: string; // YYYY-MM-DD
  gregorianEnd: string; // YYYY-MM-DD
  gregorianDisplayRange: string; // e.g. "Feb 17 - Mar 18, 2026"
  predictedGender: PredictedGender;
  predictedGenderLabel: string; // "Boy" or "Girl"
  scorePercentage: number;
  recommendationText: string;
}

/**
 * Standardized Master Prediction API Response Data Contract.
 * Single source of truth for Hero Calculator, Summary Cards, 12 Month Calendar, API routes, and Mobile apps.
 */
export interface PredictionApiResponse {
  success: boolean;
  metadata: PredictionMetadata;
  raw: PredictionResult; // Underlying Sprint 2 result for deep inspection
  viewModels: {
    hero: HeroSummaryViewModel;
    bestGirl: BestWindowCardViewModel | null;
    bestBoy: BestWindowCardViewModel | null;
    calendarMonths: MonthCardViewModel[];
  };
}
