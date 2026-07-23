import { generatePrediction } from './index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export function runApiDataContractTests() {
  console.log('Running Prediction API & Data Contract Test Suite...');

  // 1. Basic API Invocation
  const response = generatePrediction({
    motherBirthDate: '1995-05-15',
    targetYear: 2026,
  });

  assert(response.success === true, 'API response success should be true');

  // 2. Metadata Contract Verification
  assert(response.metadata.engineVersion === '1.0.0', 'Engine version matches');
  assert(typeof response.metadata.calculatedAt === 'string', 'calculatedAt ISO timestamp present');
  assert(response.metadata.totalMonthsAnalyzed >= 12, 'Analyzed months >= 12');
  assert(response.metadata.accuracyDisclaimer.length > 0, 'Disclaimer present');

  // 3. Hero View Model Contract Verification
  const hero = response.viewModels.hero;
  assert(hero.targetYear === 2026, 'Hero target year 2026');
  assert(hero.motherLunarAge > 0, 'Mother lunar age calculated');
  assert(typeof hero.dominantGenderBadgeText === 'string', 'Dominant badge text present');
  assert(typeof hero.headlineSummary === 'string', 'Headline summary present');

  // 4. Summary Card View Models Contract Verification
  const bestGirl = response.viewModels.bestGirl;
  if (bestGirl) {
    assert(bestGirl.genderTarget === 'girl', 'bestGirl target is girl');
    assert(bestGirl.available === true, 'bestGirl available');
    assert(typeof bestGirl.gregorianDateRange === 'string', 'gregorianDateRange formatted');
  }

  const bestBoy = response.viewModels.bestBoy;
  if (bestBoy) {
    assert(bestBoy.genderTarget === 'boy', 'bestBoy target is boy');
    assert(bestBoy.available === true, 'bestBoy available');
  }

  // 5. Calendar Months View Models Contract Verification
  const months = response.viewModels.calendarMonths;
  assert(months.length >= 12, 'At least 12 month view models');
  const month1 = months[0];
  assert(month1.monthIndex === 1, 'First month index is 1');
  assert(typeof month1.gregorianDisplayRange === 'string', 'Display range present');
  assert(typeof month1.predictedGenderLabel === 'string', 'Predicted gender label present');

  console.log('✅ ALL API & DATA CONTRACT TESTS PASSED SUCCESSFULLY!');
}

// Run if called directly
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.endsWith('api.test.ts')) {
  runApiDataContractTests();
}
