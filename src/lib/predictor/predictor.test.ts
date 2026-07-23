import { generateGenderPrediction, lookupGenderChart } from './index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export function runPredictorEngineTests() {
  console.log('Running Prediction Engine Test Suite...');

  // 1. Matrix Lookup & Boundary Clamping Tests
  // Mother age 18, month 1 => 'girl', month 2 => 'boy'
  assert(lookupGenderChart(18, 1) === 'girl', 'Age 18 month 1 should be girl');
  assert(lookupGenderChart(18, 2) === 'boy', 'Age 18 month 2 should be boy');

  // Age clamping: age 15 clamped to 18 => month 1 girl
  assert(lookupGenderChart(15, 1) === 'girl', 'Age 15 should clamp to 18');
  // Age 50 clamped to 45 => month 1 girl
  assert(lookupGenderChart(50, 1) === 'girl', 'Age 50 should clamp to 45');

  // 2. Full Gender Prediction Generation
  // Mother birth date: 1995-05-15, target year: 2026
  const prediction = generateGenderPrediction('1995-05-15', 2026);

  assert(prediction.targetYear === 2026, 'Target year should be 2026');
  assert(prediction.motherInfo.gregorianBirthDate === '1995-05-15', 'Birth date should match');
  assert(prediction.motherInfo.lunarBirthYear === 1995, 'Lunar birth year should be 1995');
  assert(typeof prediction.motherInfo.lunarAge === 'number', 'Lunar age should be calculated');

  assert(prediction.months.length >= 12, 'Should generate at least 12 prediction months');
  assert(prediction.bestBoy !== null, 'Best Boy window should be present');
  assert(prediction.bestGirl !== null, 'Best Girl window should be present');

  assert(
    prediction.summary.totalBoyMonths + prediction.summary.totalGirlMonths === prediction.months.length,
    'Boy + Girl months total should match total months count'
  );

  // Check month item structure
  const firstMonth = prediction.months[0];
  assert(typeof firstMonth.lunarMonth === 'number', 'lunarMonth should be a number');
  assert(typeof firstMonth.gregorianStart === 'string', 'gregorianStart should be a YYYY-MM-DD string');
  assert(typeof firstMonth.gregorianEnd === 'string', 'gregorianEnd should be a YYYY-MM-DD string');
  assert(firstMonth.predictedGender === 'boy' || firstMonth.predictedGender === 'girl', 'predictedGender valid');

  // 3. Invalid Birth Date Handling
  let errorCaught = false;
  try {
    generateGenderPrediction('invalid-date', 2026);
  } catch (err) {
    errorCaught = true;
  }
  assert(errorCaught === true, 'Should throw error for invalid birth date');

  console.log('✅ ALL PREDICTOR ENGINE TESTS PASSED SUCCESSFULLY!');
}

// Run if called directly
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.endsWith('predictor.test.ts')) {
  runPredictorEngineTests();
}
