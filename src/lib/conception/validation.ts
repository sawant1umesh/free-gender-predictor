import type { DateInput } from '../calendar/types';
import { formatGregorianDate, parseGregorianDate } from '../calendar/utils';
import { validateGregorianDate } from '../calendar/validation';
import type { ConceptionPredictionInput, ConceptionValidationResult } from './types';

export const MIN_CALENDAR_YEAR = 1900;
export const MAX_CALENDAR_YEAR = 2100;
export const MIN_CHART_AGE = 18;
export const MAX_CHART_AGE = 45;

/**
 * Validates inputs for the Chinese Gender Predictor by Conception Date.
 * Returns a discriminated result indicating whether the inputs are valid or containing structured error details.
 *
 * @param input ConceptionPredictionInput object
 * @returns ConceptionValidationResult
 */
export function validateConceptionInput(input: unknown): ConceptionValidationResult {
  if (!input || typeof input !== 'object') {
    return {
      isValid: false,
      error: {
        code: 'MISSING_BIRTH_DATE',
        message: "Mother's date of birth and estimated conception date are required.",
        field: 'general',
      },
    };
  }

  const { motherBirthDate, conceptionDate } = input as ConceptionPredictionInput;

  // 1. Check for missing / empty Mother's Date of Birth
  if (!motherBirthDate || (typeof motherBirthDate === 'string' && motherBirthDate.trim() === '')) {
    return {
      isValid: false,
      error: {
        code: 'MISSING_BIRTH_DATE',
        message: "Mother's date of birth is required.",
        field: 'motherBirthDate',
      },
    };
  }

  // 2. Check for missing / empty Conception Date
  if (!conceptionDate || (typeof conceptionDate === 'string' && conceptionDate.trim() === '')) {
    return {
      isValid: false,
      error: {
        code: 'MISSING_CONCEPTION_DATE',
        message: 'Estimated conception date is required.',
        field: 'conceptionDate',
      },
    };
  }

  // 3. Validate Gregorian Mother's Date of Birth
  const birthParsed = parseGregorianDate(motherBirthDate);
  const birthValidation = validateGregorianDate(motherBirthDate);
  if (!birthParsed || !birthValidation.isValid) {
    return {
      isValid: false,
      error: {
        code: 'INVALID_BIRTH_DATE',
        message: `Invalid mother's date of birth: ${birthValidation.errors[0] || 'Please enter a valid calendar date.'}`,
        field: 'motherBirthDate',
      },
    };
  }

  // 4. Validate Gregorian Conception Date
  const conceptionParsed = parseGregorianDate(conceptionDate);
  const conceptionValidation = validateGregorianDate(conceptionDate);
  if (!conceptionParsed || !conceptionValidation.isValid) {
    return {
      isValid: false,
      error: {
        code: 'INVALID_CONCEPTION_DATE',
        message: `Invalid conception date: ${conceptionValidation.errors[0] || 'Please enter a valid calendar date.'}`,
        field: 'conceptionDate',
      },
    };
  }

  // 5. Check supported year ranges (1900 - 2100 for reliable astronomical lunar ephemeris)
  if (birthParsed.year < MIN_CALENDAR_YEAR || birthParsed.year > MAX_CALENDAR_YEAR) {
    return {
      isValid: false,
      error: {
        code: 'DATE_OUT_OF_RANGE',
        message: `Mother's birth year (${birthParsed.year}) is outside the supported range of ${MIN_CALENDAR_YEAR} to ${MAX_CALENDAR_YEAR}.`,
        field: 'motherBirthDate',
      },
    };
  }

  if (conceptionParsed.year < MIN_CALENDAR_YEAR || conceptionParsed.year > MAX_CALENDAR_YEAR) {
    return {
      isValid: false,
      error: {
        code: 'DATE_OUT_OF_RANGE',
        message: `Conception year (${conceptionParsed.year}) is outside the supported range of ${MIN_CALENDAR_YEAR} to ${MAX_CALENDAR_YEAR}.`,
        field: 'conceptionDate',
      },
    };
  }

  // 6. Chronological Order: Conception date must be strictly after Mother's Date of Birth
  const birthUtc = Date.UTC(birthParsed.year, birthParsed.month - 1, birthParsed.day);
  const conceptionUtc = Date.UTC(conceptionParsed.year, conceptionParsed.month - 1, conceptionParsed.day);

  if (conceptionUtc <= birthUtc) {
    return {
      isValid: false,
      error: {
        code: 'CONCEPTION_BEFORE_BIRTH',
        message: "Estimated conception date must be after the mother's date of birth.",
        field: 'conceptionDate',
      },
    };
  }

  // 7. Check Mother's minimum age at conception (at least 18 years old)
  let chronologicalAge = conceptionParsed.year - birthParsed.year;
  const monthDiff = conceptionParsed.month - birthParsed.month;
  if (monthDiff < 0 || (monthDiff === 0 && conceptionParsed.day < birthParsed.day)) {
    chronologicalAge--;
  }

  if (chronologicalAge < MIN_CHART_AGE) {
    return {
      isValid: false,
      error: {
        code: 'UNDERAGE_MOTHER',
        message: `Mother must be at least ${MIN_CHART_AGE} years old at the estimated conception date. The calculated age is ${chronologicalAge} years.`,
        field: 'motherBirthDate',
      },
    };
  }

  return {
    isValid: true,
    birthDate: birthParsed,
    conceptionDate: conceptionParsed,
    formattedBirthDate: formatGregorianDate(birthParsed),
    formattedConceptionDate: formatGregorianDate(conceptionParsed),
  };
}
