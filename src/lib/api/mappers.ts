import type { PredictionResult } from '../predictor/types';
import type {
  BestWindowCardViewModel,
  HeroSummaryViewModel,
  MonthCardViewModel,
  PredictionApiRequest,
  PredictionApiResponse,
  PredictionMetadata,
} from './contracts';

const API_ENGINE_VERSION = '1.0.0';
const METHODOLOGY_LABEL = 'Authentic Qing Gong Biao (清宫表) Lunar Calendar Algorithm';
const ACCURACY_DISCLAIMER =
  'The Chinese Gender Predictor is based on ancient traditional lunar astrology and is intended for entertainment and informational purposes only. It does not replace medical advice or clinical ultrasound tests.';

/**
 * Maps raw prediction engine output to UI-ready view models and enriched metadata.
 */
export function mapToPredictionApiResponse(
  result: PredictionResult,
  request: PredictionApiRequest
): PredictionApiResponse {
  const calculatedAt = new Date().toISOString();

  // 1. Build Metadata
  const metadata: PredictionMetadata = {
    engineVersion: API_ENGINE_VERSION,
    calculatedAt,
    methodology: METHODOLOGY_LABEL,
    totalMonthsAnalyzed: result.months.length,
    accuracyDisclaimer: ACCURACY_DISCLAIMER,
  };

  // 2. Build Hero View Model
  const hero: HeroSummaryViewModel = {
    targetYear: result.targetYear,
    motherBirthDateFormatted: result.motherInfo.gregorianBirthDate,
    motherLunarAge: result.motherInfo.lunarAge,
    motherLunarBirthYear: result.motherInfo.lunarBirthYear,
    dominantGender: result.summary.dominantGender,
    dominantGenderBadgeText:
      result.summary.dominantGender === 'boy'
        ? 'Boy-leaning Year'
        : result.summary.dominantGender === 'girl'
        ? 'Girl-leaning Year'
        : 'Balanced Year',
    headlineSummary: result.summary.overallTrend,
  };

  // 3. Build Best Girl Card View Model
  const bestGirl: BestWindowCardViewModel | null = result.bestGirl
    ? {
        genderTarget: 'girl',
        available: true,
        lunarMonth: result.bestGirl.lunarMonth,
        monthNameChinese: result.bestGirl.monthName.split(' ')[0],
        gregorianDateRange: `${result.bestGirl.gregorianStart} to ${result.bestGirl.gregorianEnd}`,
        gregorianStart: result.bestGirl.gregorianStart,
        gregorianEnd: result.bestGirl.gregorianEnd,
        scorePercentage: result.bestGirl.score,
        recommendationBadgeText: 'Optimal Girl Window',
        recommendationDescription: result.bestGirl.description,
      }
    : null;

  // 4. Build Best Boy Card View Model
  const bestBoy: BestWindowCardViewModel | null = result.bestBoy
    ? {
        genderTarget: 'boy',
        available: true,
        lunarMonth: result.bestBoy.lunarMonth,
        monthNameChinese: result.bestBoy.monthName.split(' ')[0],
        gregorianDateRange: `${result.bestBoy.gregorianStart} to ${result.bestBoy.gregorianEnd}`,
        gregorianStart: result.bestBoy.gregorianStart,
        gregorianEnd: result.bestBoy.gregorianEnd,
        scorePercentage: result.bestBoy.score,
        recommendationBadgeText: 'Optimal Boy Window',
        recommendationDescription: result.bestBoy.description,
      }
    : null;

  // 5. Build Calendar Months View Models
  const calendarMonths: MonthCardViewModel[] = result.months.map((m, index) => ({
    monthIndex: index + 1,
    lunarMonthNumber: m.lunarMonth,
    lunarMonthNameChinese: m.monthNameChinese,
    lunarDaySpanChinese: m.lunarMonthName,
    isLeapMonth: m.isLeap,
    gregorianStart: m.gregorianStart,
    gregorianEnd: m.gregorianEnd,
    gregorianDisplayRange: `${m.gregorianStart} ~ ${m.gregorianEnd}`,
    predictedGender: m.predictedGender,
    predictedGenderLabel: m.predictedGender === 'boy' ? 'Boy' : 'Girl',
    scorePercentage: m.score,
    recommendationText: m.recommendation,
  }));

  return {
    success: true,
    metadata,
    raw: result,
    viewModels: {
      hero,
      bestGirl,
      bestBoy,
      calendarMonths,
    },
  };
}
