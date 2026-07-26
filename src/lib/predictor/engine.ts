import { LunarYear } from 'lunar-javascript';
import { calculateLunarAge } from '../calendar/age';
import { getLunarYear } from '../calendar/lunar';
import type { DateInput } from '../calendar/types';
import { formatGregorianDate, getCurrentYear } from '../calendar/utils';
import { validateBirthDate } from '../calendar/validation';
import { calculateWindowScore, getLunarMonthGregorianRange, getRecommendation, lookupGenderChart } from './helpers';
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

  // Retrieve Lunar months in the target year using lunar-javascript
  const lunarYearObj = LunarYear.fromYear(targetYear);
  const lunarMonths = lunarYearObj.getMonthsInYear();

  const months: PredictionMonth[] = [];
  let totalBoyMonths = 0;
  let totalGirlMonths = 0;

  let bestBoyMonth: PredictionMonth | null = null;
  let bestGirlMonth: PredictionMonth | null = null;

  for (const monthObj of lunarMonths) {
    const rawMonth = monthObj.getMonth();
    const absMonth = Math.abs(rawMonth);
    const isLeap = monthObj.isLeap();

    // Look up gender prediction in Qing Gong Biao chart
    const predictedGender = lookupGenderChart(lunarAge, absMonth);

    // Calculate Gregorian date window for this lunar month
    const range = getLunarMonthGregorianRange(targetYear, monthObj);

    // Calculate score & recommendation
    const score = calculateWindowScore(predictedGender, absMonth, isLeap);
    const recommendation = getRecommendation(predictedGender, absMonth);

    // Build lunar month name display (e.g. "正月初一 - 正月廿九")
    const lunarMonthName = `${range.monthNameChinese}初一 - ${range.monthNameChinese}${range.dayCount === 30 ? '三十' : '廿九'}`;

    const monthData: PredictionMonth = {
      lunarMonth: absMonth,
      lunarMonthName,
      monthNameChinese: range.monthNameChinese,
      isLeap,
      gregorianStart: range.gregorianStart,
      gregorianEnd: range.gregorianEnd,
      predictedGender,
      score,
      recommendation,
    };

    months.push(monthData);

    if (predictedGender === 'boy') {
      totalBoyMonths++;
      if (!bestBoyMonth || monthData.score > bestBoyMonth.score) {
        bestBoyMonth = monthData;
      }
    } else {
      totalGirlMonths++;
      if (!bestGirlMonth || monthData.score > bestGirlMonth.score) {
        bestGirlMonth = monthData;
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
