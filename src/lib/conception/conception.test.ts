import {
  calculateMotherLunarAgeAtConception,
  getLunarConceptionMonth,
  lookupConceptionGender,
  predictGenderByConception,
  validateConceptionInput,
} from './index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export function runConceptionEngineTests() {
  console.log('Running Chinese Gender Predictor by Conception Date Test Suite...');

  // =========================================================================
  // Test Category 1: Normal Valid Dates
  // =========================================================================
  const res1 = predictGenderByConception({
    motherBirthDate: '1995-05-15',
    conceptionDate: '2026-06-20',
  });
  assert(res1.success === true, 'Valid dates should produce success=true');
  if (res1.success) {
    assert(res1.prediction === 'Boy' || res1.prediction === 'Girl', 'Prediction should be Boy or Girl');
    assert(res1.lunarBirthYear === 1995, 'Lunar birth year should be 1995');
    assert(res1.lunarConceptionYear === 2026, 'Lunar conception year should be 2026');
    assert(res1.lunarAge === 32, 'Lunar age for 1995 birth & 2026 conception should be 32');
    assert(res1.details.birthDate === '1995-05-15', 'Details birthDate formatted');
    assert(res1.details.conceptionDate === '2026-06-20', 'Details conceptionDate formatted');
    assert(res1.details.lunarBirthZodiac === 'Pig', '1995 Zodiac should be Pig');
    assert(res1.details.lunarConceptionZodiac === 'Horse', '2026 Zodiac should be Horse');
  }

  // =========================================================================
  // Test Category 2: Different Birth Years
  // =========================================================================
  const birthYears = ['1980-03-10', '1985-07-22', '1990-11-05', '1998-04-18', '2004-09-30'];
  for (const dob of birthYears) {
    const res = predictGenderByConception({
      motherBirthDate: dob,
      conceptionDate: '2026-05-15',
    });
    assert(res.success === true, `Birth date ${dob} should calculate successfully`);
    if (res.success) {
      assert(res.lunarAge >= 18, `Lunar age for ${dob} should be >= 18`);
    }
  }

  // =========================================================================
  // Test Category 3: Different Conception Years
  // =========================================================================
  const conceptionYears = ['2024-03-15', '2025-06-10', '2026-08-20', '2027-01-15'];
  for (const cd of conceptionYears) {
    const res = predictGenderByConception({
      motherBirthDate: '1996-08-12',
      conceptionDate: cd,
    });
    assert(res.success === true, `Conception date ${cd} should calculate successfully`);
  }

  // =========================================================================
  // Test Category 4: Leap Years (Gregorian and Chinese Lunar)
  // =========================================================================
  // Gregorian Leap Day: 2024-02-29
  const resGregLeap = predictGenderByConception({
    motherBirthDate: '1996-02-29',
    conceptionDate: '2024-02-29',
  });
  assert(resGregLeap.success === true, 'Gregorian leap day Feb 29 should be handled properly');

  // Lunar Leap Month: 2020 had a Leap 4th Month (闰四月)
  // 2020-05-23 falls in Lunar 2020 Leap 4th Month
  const lunarLeapRes = getLunarConceptionMonth('2020-05-23');
  assert(lunarLeapRes.isLeapMonth === true, '2020-05-23 should be detected as leap month');
  assert(lunarLeapRes.lunarMonth === 4, '2020-05-23 lunar month should be 4');
  assert(lunarLeapRes.monthNameChinese.startsWith('闰'), 'Month name should start with 闰');

  const resLunarLeapPred = predictGenderByConception({
    motherBirthDate: '1995-05-15',
    conceptionDate: '2020-05-23',
  });
  assert(resLunarLeapPred.success === true, 'Prediction during leap month should succeed');
  if (resLunarLeapPred.success) {
    assert(resLunarLeapPred.details.isLeapMonth === true, 'details.isLeapMonth should be true');
  }

  // =========================================================================
  // Test Category 5: Chinese New Year (CNY) Boundary Dates
  // =========================================================================
  // In 1990, CNY fell on 1990-01-27.
  // 1990-01-20 was before CNY -> Lunar Year 1989 (Snake, 己巳年)
  // 1990-02-05 was after CNY  -> Lunar Year 1990 (Horse, 庚午年)
  const beforeCny1990 = predictGenderByConception({
    motherBirthDate: '1990-01-20',
    conceptionDate: '2026-06-01',
  });
  assert(beforeCny1990.success === true, 'Pre-CNY 1990 date should succeed');
  if (beforeCny1990.success) {
    assert(beforeCny1990.lunarBirthYear === 1989, 'Pre-CNY 1990-01-20 lunar birth year must be 1989');
    assert(beforeCny1990.details.lunarBirthZodiac === 'Snake', '1989 zodiac is Snake');
    assert(beforeCny1990.lunarAge === 2026 - 1989 + 1, 'Lunar age must be 2026 - 1989 + 1 = 38');
  }

  const afterCny1990 = predictGenderByConception({
    motherBirthDate: '1990-02-05',
    conceptionDate: '2026-06-01',
  });
  assert(afterCny1990.success === true, 'Post-CNY 1990 date should succeed');
  if (afterCny1990.success) {
    assert(afterCny1990.lunarBirthYear === 1990, 'Post-CNY 1990-02-05 lunar birth year must be 1990');
    assert(afterCny1990.details.lunarBirthZodiac === 'Horse', '1990 zodiac is Horse');
    assert(afterCny1990.lunarAge === 2026 - 1990 + 1, 'Lunar age must be 2026 - 1990 + 1 = 37');
  }

  // =========================================================================
  // Test Category 6: Lunar Month Conversion
  // =========================================================================
  // 2026-02-17 is Chinese New Year 2026 (Month 1, Day 1)
  const cny2026 = getLunarConceptionMonth('2026-02-17');
  assert(cny2026.lunarYear === 2026, '2026-02-17 should be Lunar Year 2026');
  assert(cny2026.lunarMonth === 1, '2026-02-17 should be Lunar Month 1');
  assert(cny2026.lunarDay === 1, '2026-02-17 should be Lunar Day 1');

  // =========================================================================
  // Test Category 7: Lunar Age Calculation (Xūsuì)
  // =========================================================================
  const ageCalc = calculateMotherLunarAgeAtConception('1995-05-15', '2026-07-01');
  assert(ageCalc.birthLunarYear === 1995, 'Birth lunar year should be 1995');
  assert(ageCalc.conceptionLunarYear === 2026, 'Conception lunar year should be 2026');
  assert(ageCalc.lunarAge === 32, 'Traditional Lunar Age must be 32 (2026 - 1995 + 1)');

  // =========================================================================
  // Test Category 8: Invalid Dates & Missing Input Handling
  // =========================================================================
  // Missing DOB
  const missingDob = predictGenderByConception({
    motherBirthDate: '',
    conceptionDate: '2026-05-01',
  });
  assert(missingDob.success === false, 'Missing DOB should fail');
  if (!missingDob.success) {
    assert(missingDob.error.code === 'MISSING_BIRTH_DATE', 'Error code should be MISSING_BIRTH_DATE');
    assert(missingDob.error.field === 'motherBirthDate', 'Field should be motherBirthDate');
  }

  // Missing Conception Date
  const missingCd = predictGenderByConception({
    motherBirthDate: '1995-05-15',
    conceptionDate: '',
  });
  assert(missingCd.success === false, 'Missing conception date should fail');
  if (!missingCd.success) {
    assert(missingCd.error.code === 'MISSING_CONCEPTION_DATE', 'Error code should be MISSING_CONCEPTION_DATE');
  }

  // Invalid Calendar Date: Feb 29 on non-leap year 2023
  const invalidFeb29 = predictGenderByConception({
    motherBirthDate: '1995-05-15',
    conceptionDate: '2023-02-29',
  });
  assert(invalidFeb29.success === false, '2023-02-29 should fail validation');
  if (!invalidFeb29.success) {
    assert(invalidFeb29.error.code === 'INVALID_CONCEPTION_DATE', 'Should flag INVALID_CONCEPTION_DATE');
  }

  // Malformed date string
  const malformed = predictGenderByConception({
    motherBirthDate: 'invalid-string',
    conceptionDate: '2026-05-01',
  });
  assert(malformed.success === false, 'Malformed date should fail');
  if (!malformed.success) {
    assert(malformed.error.code === 'INVALID_BIRTH_DATE', 'Should flag INVALID_BIRTH_DATE');
  }

  // =========================================================================
  // Test Category 9: Conception Date Before or Equal to Birth Date
  // =========================================================================
  const conceptionBeforeBirth = predictGenderByConception({
    motherBirthDate: '2000-05-15',
    conceptionDate: '1999-01-01',
  });
  assert(conceptionBeforeBirth.success === false, 'Conception before birth must fail');
  if (!conceptionBeforeBirth.success) {
    assert(conceptionBeforeBirth.error.code === 'CONCEPTION_BEFORE_BIRTH', 'Should be CONCEPTION_BEFORE_BIRTH');
  }

  const conceptionEqualsBirth = predictGenderByConception({
    motherBirthDate: '2000-05-15',
    conceptionDate: '2000-05-15',
  });
  assert(conceptionEqualsBirth.success === false, 'Conception on same day as birth must fail');
  if (!conceptionEqualsBirth.success) {
    assert(conceptionEqualsBirth.error.code === 'CONCEPTION_BEFORE_BIRTH', 'Should be CONCEPTION_BEFORE_BIRTH');
  }

  // Underage mother (chronological age < 18)
  const underage = predictGenderByConception({
    motherBirthDate: '2015-01-01',
    conceptionDate: '2026-01-01',
  });
  assert(underage.success === false, 'Underage mother (<18) must fail');
  if (!underage.success) {
    assert(underage.error.code === 'UNDERAGE_MOTHER', 'Should be UNDERAGE_MOTHER');
  }

  // =========================================================================
  // Test Category 10: Strict vs Non-Strict Chart Boundaries
  // =========================================================================
  // Age 50 mother (born 1976, conception 2026 -> lunar age 51)
  const nonStrict = predictGenderByConception({
    motherBirthDate: '1976-05-15',
    conceptionDate: '2026-06-01',
    strictAgeRange: false,
  });
  assert(nonStrict.success === true, 'Non-strict mode should succeed with clamping');
  if (nonStrict.success) {
    assert(nonStrict.details.ageClamped === true, 'details.ageClamped should be true');
  }

  const strictRes = predictGenderByConception({
    motherBirthDate: '1976-05-15',
    conceptionDate: '2026-06-01',
    strictAgeRange: true,
  });
  assert(strictRes.success === false, 'Strict mode should reject age > 45');
  if (!strictRes.success) {
    assert(strictRes.error.code === 'CHART_DATA_UNAVAILABLE', 'Should return CHART_DATA_UNAVAILABLE');
  }

  // =========================================================================
  // Test Category 11: Different Lunar Ages Across the Spectrum
  // =========================================================================
  // Test specific known matrix coordinates from Qing Gong Biao
  // Age 18, Month 1 -> 'Girl'
  const age18M1 = lookupConceptionGender(18, 1);
  assert(age18M1 !== null && age18M1.prediction === 'Girl', 'Age 18 Month 1 should be Girl');

  // Age 18, Month 2 -> 'Boy'
  const age18M2 = lookupConceptionGender(18, 2);
  assert(age18M2 !== null && age18M2.prediction === 'Boy', 'Age 18 Month 2 should be Boy');

  // Age 21, Month 1 -> 'Boy'
  const age21M1 = lookupConceptionGender(21, 1);
  assert(age21M1 !== null && age21M1.prediction === 'Boy', 'Age 21 Month 1 should be Boy');

  // Age 21, Month 2 -> 'Girl'
  const age21M2 = lookupConceptionGender(21, 2);
  assert(age21M2 !== null && age21M2.prediction === 'Girl', 'Age 21 Month 2 should be Girl');

  // Age 30, Month 11 -> 'Boy'
  const age30M11 = lookupConceptionGender(30, 11);
  assert(age30M11 !== null && age30M11.prediction === 'Boy', 'Age 30 Month 11 should be Boy');

  // Age 45, Month 12 -> 'Boy'
  const age45M12 = lookupConceptionGender(45, 12);
  assert(age45M12 !== null && age45M12.prediction === 'Boy', 'Age 45 Month 12 should be Boy');

  // =========================================================================
  // Test Category 12: All 12 Lunar Conception Months
  // =========================================================================
  for (let m = 1; m <= 12; m++) {
    const lookup = lookupConceptionGender(25, m);
    assert(lookup !== null, `Month ${m} lookup for age 25 must exist`);
    assert(lookup?.prediction === 'Boy' || lookup?.prediction === 'Girl', `Month ${m} prediction must be Boy or Girl`);
  }

  console.log('✅ ALL 12 CONCEPTION ENGINE TEST CATEGORIES PASSED SUCCESSFULLY!');
}

// Run test if invoked directly in Node
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.endsWith('conception.test.ts')) {
  runConceptionEngineTests();
}
