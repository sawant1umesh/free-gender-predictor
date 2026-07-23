import type { DateInput, DateValidationResult, GregorianDate } from './types';
import { getDaysInMonth, parseGregorianDate } from './utils';

/**
 * Validates a Gregorian date for correctness, impossible bounds, and valid month/day ranges.
 */
export function validateGregorianDate(input: DateInput): DateValidationResult {
  const errors: string[] = [];

  const parsed = parseGregorianDate(input);
  if (!parsed) {
    return {
      isValid: false,
      errors: ['Invalid date format. Expected a valid Date object, YYYY-MM-DD string, or GregorianDate object.'],
    };
  }

  const { year, month, day } = parsed;

  // Check integer types
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    errors.push('Year, month, and day must all be integers.');
    return { isValid: false, errors };
  }

  // Check impossible year bounds
  if (year < 1 || year > 9999) {
    errors.push(`Impossible year (${year}). Year must be between 1 and 9999.`);
  }

  // Check month bounds
  if (month < 1 || month > 12) {
    errors.push(`Invalid month (${month}). Month must be between 1 and 12.`);
  }

  // Check day bounds based on month and leap year
  if (month >= 1 && month <= 12) {
    const maxDays = getDaysInMonth(year, month);
    if (day < 1) {
      errors.push(`Invalid day (${day}). Day must be at least 1.`);
    } else if (day > maxDays) {
      if (month === 2 && day === 29) {
        errors.push(`February 29 is invalid in year ${year} (not a leap year).`);
      } else {
        errors.push(`Invalid day (${day}) for month ${month}. Maximum allowed days in this month is ${maxDays}.`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a birth date, ensuring it is a valid Gregorian date and not in the future.
 *
 * @param birthInput Date input for birth date
 * @param referenceInput Target reference date to check future constraint against (defaults to today)
 */
export function validateBirthDate(
  birthInput: DateInput,
  referenceInput: DateInput = new Date()
): DateValidationResult {
  const baseValidation = validateGregorianDate(birthInput);
  if (!baseValidation.isValid) {
    return baseValidation;
  }

  const refValidation = validateGregorianDate(referenceInput);
  if (!refValidation.isValid) {
    return {
      isValid: false,
      errors: ['Reference date for future check is invalid.', ...refValidation.errors],
    };
  }

  const birthDate = parseGregorianDate(birthInput)!;
  const refDate = parseGregorianDate(referenceInput)!;

  const errors: string[] = [...baseValidation.errors];

  // Compare birth date vs reference date
  const birthTime = Date.UTC(birthDate.year, birthDate.month - 1, birthDate.day);
  const refTime = Date.UTC(refDate.year, refDate.month - 1, refDate.day);

  if (birthTime > refTime) {
    errors.push(
      `Birth date (${birthDate.year}-${String(birthDate.month).padStart(2, '0')}-${String(
        birthDate.day
      ).padStart(2, '0')}) cannot be in the future relative to ${refDate.year}-${String(
        refDate.month
      ).padStart(2, '0')}-${String(refDate.day).padStart(2, '0')}.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
