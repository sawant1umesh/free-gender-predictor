import type { DateInput } from '../calendar/types';
import { generateGenderPrediction } from '../predictor/engine';
import type { PredictionApiRequest, PredictionApiResponse } from './contracts';
import { mapToPredictionApiResponse } from './mappers';

/**
 * Public Prediction API Service function.
 * Serves as the single source of truth data contract for Hero Calculator, Summary Cards,
 * 12-Month Calendar grid, future REST API endpoints, and mobile clients.
 *
 * @param input DateInput (birth date string/Date) OR structured PredictionApiRequest payload
 * @param targetYearInput Optional target Gregorian year
 * @returns Standardized PredictionApiResponse Data Contract
 */
export function generatePrediction(
  input: PredictionApiRequest | DateInput,
  targetYearInput?: number
): PredictionApiResponse {
  let requestPayload: PredictionApiRequest;

  if (typeof input === 'object' && input !== null && 'motherBirthDate' in input) {
    requestPayload = input as PredictionApiRequest;
  } else {
    requestPayload = {
      motherBirthDate: input as DateInput,
      targetYear: targetYearInput,
    };
  }

  // Reuse Sprint 2 Prediction Engine internally
  const rawResult = generateGenderPrediction(requestPayload.motherBirthDate, requestPayload.targetYear);

  // Map to stable Data Contract and View Models
  return mapToPredictionApiResponse(rawResult, requestPayload);
}
