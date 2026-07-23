import {
  calculateLunarAge,
  formatGregorianDate,
  getCurrentYear,
  getDaysInMonth,
  getLunarDay,
  getLunarMonth,
  getLunarYear,
  getYearLeapMonth,
  gregorianToLunar,
  isLeapMonth,
  isLeapYear,
  parseGregorianDate,
  validateBirthDate,
  validateGregorianDate,
} from './index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export function runCalendarEngineTests() {
  console.log('Running Calendar Engine Test Suite...');

  // 1. Gregorian Utilities
  assert(isLeapYear(2024) === true, '2024 should be leap year');
  assert(isLeapYear(2023) === false, '2023 should not be leap year');
  assert(isLeapYear(2000) === true, '2000 should be leap year');
  assert(isLeapYear(1900) === false, '1900 should not be leap year');

  assert(getDaysInMonth(2024, 2) === 29, 'Feb 2024 should have 29 days');
  assert(getDaysInMonth(2023, 2) === 28, 'Feb 2023 should have 28 days');
  assert(getDaysInMonth(2023, 4) === 30, 'Apr 2023 should have 30 days');

  assert(getCurrentYear() > 2020, 'getCurrentYear should return a valid year');

  const parsed = parseGregorianDate('1995-05-15');
  assert(parsed !== null && parsed.year === 1995 && parsed.month === 5 && parsed.day === 15, 'Date parsing YYYY-MM-DD failed');
  assert(formatGregorianDate({ year: 1995, month: 5, day: 15 }) === '1995-05-15', 'Date formatting failed');

  // 2. Gregorian Validation
  const validRes = validateGregorianDate('2024-02-29');
  assert(validRes.isValid === true, 'Feb 29 2024 should be valid');

  const invalidFeb29 = validateGregorianDate('2023-02-29');
  assert(invalidFeb29.isValid === false, 'Feb 29 2023 should be invalid');

  const invalidApril31 = validateGregorianDate('2023-04-31');
  assert(invalidApril31.isValid === false, 'April 31 should be invalid');

  const impossibleYear = validateGregorianDate({ year: -5, month: 5, day: 10 });
  assert(impossibleYear.isValid === false, 'Negative year should be invalid');

  const futureBirth = validateBirthDate('2099-01-01', new Date('2025-01-01'));
  assert(futureBirth.isValid === false, 'Future birth date should be rejected');

  // 3. Chinese Lunar Conversion
  // Test case: 1995-05-15 Gregorian => Lunar 1995-04-16
  const lunar1995 = gregorianToLunar('1995-05-15');
  assert(lunar1995.year === 1995, 'Lunar year for 1995-05-15 should be 1995');
  assert(lunar1995.month === 4, 'Lunar month for 1995-05-15 should be 4');
  assert(lunar1995.day === 16, 'Lunar day for 1995-05-15 should be 16');
  assert(getLunarYear('1995-05-15') === 1995, 'getLunarYear helper failed');
  assert(getLunarMonth('1995-05-15') === 4, 'getLunarMonth helper failed');
  assert(getLunarDay('1995-05-15') === 16, 'getLunarDay helper failed');

  // Test leap month year 2020: Leap 4th month in Chinese lunar calendar 2020
  // Gregorian 2020-05-23 corresponds to Lunar 2020 leap 4th month 1st day (闰四月初一)
  const leap2020Month = getYearLeapMonth(2020);
  assert(leap2020Month === 4, '2020 Lunar year leap month should be 4');

  const leapDate2020 = gregorianToLunar('2020-05-23');
  assert(leapDate2020.isLeap === true, '2020-05-23 should fall in a leap month');
  assert(isLeapMonth('2020-05-23') === true, 'isLeapMonth helper failed');

  // 4. Chinese Lunar Age (虚岁)
  // Birth Date: 1995-05-15 (Lunar Year 1995)
  // Target Date: 2026-07-01 (Lunar Year 2026)
  // Lunar Age = 2026 - 1995 + 1 = 32
  const ageRes = calculateLunarAge('1995-05-15', '2026-07-01');
  assert(ageRes.birthLunarYear === 1995, 'birthLunarYear should be 1995');
  assert(ageRes.targetLunarYear === 2026, 'targetLunarYear should be 2026');
  assert(ageRes.lunarAge === 32, 'lunarAge should be 32 (2026 - 1995 + 1)');

  console.log('✅ ALL CALENDAR ENGINE TESTS PASSED SUCCESSFULLY!');
}

// Run test if invoked directly in Node
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.endsWith('calendar.test.ts')) {
  runCalendarEngineTests();
}
