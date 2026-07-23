import type { PredictedGender } from './types';

export const MIN_LUNAR_AGE = 18;
export const MAX_LUNAR_AGE = 45;

/**
 * Authentic Qing Gong Biao (清宫表) Chinese Gender Chart Matrix.
 * Key 1: Mother's Lunar Age (虚岁 18 - 45)
 * Key 2: Chinese Lunar Conception Month (1 - 12)
 * Value: 'boy' | 'girl'
 */
export const QING_GONG_BIAO_MATRIX: Record<number, Record<number, PredictedGender>> = {
  18: { 1: 'girl', 2: 'boy', 3: 'girl', 4: 'boy', 5: 'boy', 6: 'boy', 7: 'boy', 8: 'boy', 9: 'boy', 10: 'boy', 11: 'boy', 12: 'boy' },
  19: { 1: 'boy', 2: 'girl', 3: 'boy', 4: 'girl', 5: 'girl', 6: 'boy', 7: 'boy', 8: 'boy', 9: 'boy', 10: 'boy', 11: 'girl', 12: 'girl' },
  20: { 1: 'girl', 2: 'boy', 3: 'girl', 4: 'boy', 5: 'boy', 6: 'boy', 7: 'boy', 8: 'boy', 9: 'boy', 10: 'girl', 11: 'boy', 12: 'boy' },
  21: { 1: 'boy', 2: 'girl', 3: 'girl', 4: 'girl', 5: 'girl', 6: 'girl', 7: 'girl', 8: 'girl', 9: 'girl', 10: 'girl', 11: 'girl', 12: 'girl' },
  22: { 1: 'girl', 2: 'boy', 3: 'boy', 4: 'girl', 5: 'boy', 6: 'girl', 7: 'girl', 8: 'boy', 9: 'girl', 10: 'girl', 11: 'girl', 12: 'girl' },
  23: { 1: 'boy', 2: 'boy', 3: 'girl', 4: 'boy', 5: 'boy', 6: 'girl', 7: 'boy', 8: 'girl', 9: 'boy', 10: 'boy', 11: 'boy', 12: 'girl' },
  24: { 1: 'boy', 2: 'girl', 3: 'boy', 4: 'boy', 5: 'girl', 6: 'boy', 7: 'boy', 8: 'girl', 9: 'girl', 10: 'girl', 11: 'girl', 12: 'girl' },
  25: { 1: 'girl', 2: 'boy', 3: 'boy', 4: 'girl', 5: 'girl', 6: 'boy', 7: 'girl', 8: 'boy', 9: 'boy', 10: 'boy', 11: 'boy', 12: 'boy' },
  26: { 1: 'boy', 2: 'girl', 3: 'boy', 4: 'girl', 5: 'girl', 6: 'boy', 7: 'girl', 8: 'boy', 9: 'girl', 10: 'girl', 11: 'girl', 12: 'girl' },
  27: { 1: 'girl', 2: 'boy', 3: 'girl', 4: 'boy', 5: 'girl', 6: 'girl', 7: 'boy', 8: 'boy', 9: 'boy', 10: 'girl', 11: 'boy', 12: 'boy' },
  28: { 1: 'boy', 2: 'girl', 3: 'boy', 4: 'girl', 5: 'girl', 6: 'girl', 7: 'boy', 8: 'boy', 9: 'boy', 10: 'boy', 11: 'girl', 12: 'girl' },
  29: { 1: 'girl', 2: 'boy', 3: 'girl', 4: 'girl', 5: 'boy', 6: 'boy', 7: 'boy', 8: 'boy', 9: 'boy', 10: 'girl', 11: 'girl', 12: 'girl' },
  30: { 1: 'boy', 2: 'girl', 3: 'girl', 4: 'girl', 5: 'girl', 6: 'girl', 7: 'girl', 8: 'girl', 9: 'girl', 10: 'girl', 11: 'boy', 12: 'boy' },
  31: { 1: 'boy', 2: 'girl', 3: 'boy', 4: 'girl', 5: 'girl', 6: 'girl', 7: 'girl', 8: 'girl', 9: 'girl', 10: 'girl', 11: 'girl', 12: 'boy' },
  32: { 1: 'boy', 2: 'girl', 3: 'boy', 4: 'girl', 5: 'girl', 6: 'girl', 7: 'girl', 8: 'girl', 9: 'girl', 10: 'girl', 11: 'girl', 12: 'boy' },
  33: { 1: 'girl', 2: 'boy', 3: 'girl', 4: 'boy', 5: 'girl', 6: 'girl', 7: 'girl', 8: 'boy', 9: 'girl', 10: 'girl', 11: 'girl', 12: 'boy' },
  34: { 1: 'boy', 2: 'girl', 3: 'boy', 4: 'girl', 5: 'girl', 6: 'girl', 7: 'girl', 8: 'girl', 9: 'girl', 10: 'girl', 11: 'boy', 12: 'boy' },
  35: { 1: 'boy', 2: 'boy', 3: 'girl', 4: 'boy', 5: 'girl', 6: 'girl', 7: 'girl', 8: 'boy', 9: 'girl', 10: 'girl', 11: 'boy', 12: 'boy' },
  36: { 1: 'girl', 2: 'boy', 3: 'boy', 4: 'girl', 5: 'boy', 6: 'girl', 7: 'girl', 8: 'girl', 9: 'boy', 10: 'boy', 11: 'boy', 12: 'boy' },
  37: { 1: 'boy', 2: 'girl', 3: 'boy', 4: 'boy', 5: 'girl', 6: 'boy', 7: 'girl', 8: 'boy', 9: 'girl', 10: 'boy', 11: 'girl', 12: 'boy' },
  38: { 1: 'girl', 2: 'boy', 3: 'girl', 4: 'boy', 5: 'boy', 6: 'girl', 7: 'boy', 8: 'girl', 9: 'boy', 10: 'girl', 11: 'boy', 12: 'girl' },
  39: { 1: 'boy', 2: 'girl', 3: 'boy', 4: 'boy', 5: 'boy', 6: 'girl', 7: 'girl', 8: 'boy', 9: 'girl', 10: 'boy', 11: 'girl', 12: 'girl' },
  40: { 1: 'girl', 2: 'boy', 3: 'girl', 4: 'boy', 5: 'girl', 6: 'boy', 7: 'boy', 8: 'girl', 9: 'boy', 10: 'girl', 11: 'boy', 12: 'girl' },
  41: { 1: 'boy', 2: 'girl', 3: 'boy', 4: 'girl', 5: 'boy', 6: 'girl', 7: 'boy', 8: 'boy', 9: 'girl', 10: 'boy', 11: 'girl', 12: 'boy' },
  42: { 1: 'girl', 2: 'boy', 3: 'girl', 4: 'boy', 5: 'girl', 6: 'boy', 7: 'girl', 8: 'boy', 9: 'boy', 10: 'girl', 11: 'boy', 12: 'girl' },
  43: { 1: 'boy', 2: 'girl', 3: 'boy', 4: 'girl', 5: 'boy', 6: 'girl', 7: 'boy', 8: 'girl', 9: 'boy', 10: 'boy', 11: 'boy', 12: 'boy' },
  44: { 1: 'boy', 2: 'boy', 3: 'girl', 4: 'boy', 5: 'boy', 6: 'boy', 7: 'girl', 8: 'boy', 9: 'girl', 10: 'boy', 11: 'girl', 12: 'girl' },
  45: { 1: 'girl', 2: 'boy', 3: 'boy', 4: 'girl', 5: 'girl', 6: 'girl', 7: 'boy', 8: 'girl', 9: 'boy', 10: 'girl', 11: 'boy', 12: 'boy' },
};

export const CHINESE_MONTH_NAMES: Record<number, string> = {
  1: '正月',
  2: '二月',
  3: '三月',
  4: '四月',
  5: '五月',
  6: '六月',
  7: '七月',
  8: '八月',
  9: '九月',
  10: '十月',
  11: '冬月',
  12: '腊月',
};
