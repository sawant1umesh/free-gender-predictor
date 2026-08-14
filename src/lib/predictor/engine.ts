import lunarData from '../../data/lunar-months.json';
import { calculateLunarAge } from '../calendar/age';
import { getLunarYear } from '../calendar/lunar';
import type { DateInput } from '../calendar/types';
import { formatGregorianDate, getCurrentYear } from '../calendar/utils';
import { validateBirthDate } from '../calendar/validation';
import { calculateWindowScore, getRecommendation, lookupGenderChart } from './helpers';
import { CHINESE_MONTH_NAMES } from './constants';
import type { BestWindowResult, PredictionMonth, PredictionOptions, PredictionResult, PredictionSummary } from './types';

/**
 * Generates a full Chinese Gender Prediction for a mother's date of birth and a target year.
 *
 * @param options DateInput for mother's birth date OR PredictionOptions object
 * @param targetYearInput Optional target Gregorian year (defaults to current year)
 * @returns Structured PredictionResult object ready for consumption by future UI
 */
export function generateGenderPrediction(
  options: DateInput | PredictionOptions,
  targetYearInput?: number
): PredictionResult {
  // Normalize parameters
  let motherBirthDate: DateInput;
  let targetYear: number;

  if (typeof options === 'object' && options !== null && 'motherBirthDate' in options) {
    const opts = options as PredictionOptions;
    motherBirthDate = opts.motherBirthDate;
    targetYear = opts.targetYear || getCurrentYear();
  } else {
    motherBirthDate = options as DateInput;
    targetYear = targetYearInput || getCurrentYear();
  }

  // Validate birth date against target year start date (or current date if target year is current)
  const referenceTargetDate = `${targetYear}-01-01`;
  const validation = validateBirthDate(motherBirthDate, new Date());
  if (!validation.isValid) {
    throw new Error(`Invalid Mother Birth Date: ${validation.errors.join('; ')}`);
  }

  // Calculate Mother's Chinese Lunar Age and Lunar Birth Year using Sprint 1 module
  // skipValidation=true because validateBirthDate was already called above
  const lunarAgeResult = calculateLunarAge(motherBirthDate, referenceTargetDate, true);
  const formattedBirthDate = formatGregorianDate(motherBirthDate);
  const lunarBirthYear = lunarAgeResult.birthLunarYear;
  const lunarAge = lunarAgeResult.lunarAge;

  // Retrieve Lunar months from pre-computed data
  const yearData = (lunarData as Record<string, any>)[String(targetYear)];
  if (!yearData) {
    throw new Error(`Lunar data not available for year ${targetYear}. Supported range: 2020-2035.`);
  }
  const monthsData = yearData.months;

  const months: PredictionMonth[] = [];
  let totalBoyMonths = 0;
  let totalGirlMonths = 0;

  let bestBoyMonth: PredictionMonth | null = null;
  let bestGirlMonth: PredictionMonth | null = null;

  for (const monthData of monthsData) {
    const absMonth = monthData.absMonth;
    const isLeap = monthData.isLeap;

    // Look up gender prediction in Qing Gong Biao chart
    const predictedGender = lookupGenderChart(lunarAge, absMonth);

    // Get Gregorian date window from pre-computed data
    const gregorianStart = monthData.gregorianStart;
    const gregorianEnd = monthData.gregorianEnd;
    const dayCount = monthData.dayCount;

    // Calculate score & recommendation
    const score = calculateWindowScore(predictedGender, absMonth, isLeap);
    const recommendation = getRecommendation(predictedGender, absMonth);

    // Build lunar month name display
    const baseName = CHINESE_MONTH_NAMES[absMonth] || `${absMonth}月`;
    const monthNameChinese = isLeap ? `闰${baseName}` : baseName;
    const lunarMonthName = `${monthNameChinese}初一 - ${monthNameChinese}${dayCount === 30 ? '三十' : '廿九'}`;

    const monthEntry: PredictionMonth = {
      lunarMonth: absMonth,
      lunarMonthName,
      monthNameChinese,
      isLeap,
      gregorianStart,
      gregorianEnd,
      predictedGender,
      score,
      recommendation,
    };

    months.push(monthEntry);

    if (predictedGender === 'boy') {
      totalBoyMonths++;
      if (!bestBoyMonth || monthEntry.score > bestBoyMonth.score) {
        bestBoyMonth = monthEntry;
      }
    } else {
      totalGirlMonths++;
      if (!bestGirlMonth || monthEntry.score > bestGirlMonth.score) {
        bestGirlMonth = monthEntry;
      }
    }
  }

  // Determine dominant gender and overall trend summary
  let dominantGender: PredictionSummary['dominantGender'] = 'balanced';
  let overallTrend = 'Balanced Boy/Girl prediction year';

  if (totalBoyMonths > totalGirlMonths) {
    dominantGender = 'boy';
    overallTrend = `Boy-favorable year (${totalBoyMonths} Boy months vs ${totalGirlMonths} Girl months)`;
  } else if (totalGirlMonths > totalBoyMonths) {
    dominantGender = 'girl';
    overallTrend = `Girl-favorable year (${totalGirlMonths} Girl months vs ${totalBoyMonths} Boy months)`;
  }

  const summary: PredictionSummary = {
    totalBoyMonths,
    totalGirlMonths,
    overallTrend,
    dominantGender,
  };

  const bestBoy: BestWindowResult | null = bestBoyMonth
    ? {
        lunarMonth: bestBoyMonth.lunarMonth,
        monthName: `${bestBoyMonth.monthNameChinese} (${bestBoyMonth.gregorianStart} to ${bestBoyMonth.gregorianEnd})`,
        gregorianStart: bestBoyMonth.gregorianStart,
        gregorianEnd: bestBoyMonth.gregorianEnd,
        score: bestBoyMonth.score,
        description: bestBoyMonth.recommendation,
      }
    : null;

  const bestGirl: BestWindowResult | null = bestGirlMonth
    ? {
        lunarMonth: bestGirlMonth.lunarMonth,
        monthName: `${bestGirlMonth.monthNameChinese} (${bestGirlMonth.gregorianStart} to ${bestGirlMonth.gregorianEnd})`,
        gregorianStart: bestGirlMonth.gregorianStart,
        gregorianEnd: bestGirlMonth.gregorianEnd,
        score: bestGirlMonth.score,
        description: bestGirlMonth.recommendation,
      }
    : null;

  return {
    targetYear,
    motherInfo: {
      gregorianBirthDate: formattedBirthDate,
      lunarBirthYear,
      lunarAge,
    },
    bestGirl,
    bestBoy,
    summary,
    months,
  };
}
