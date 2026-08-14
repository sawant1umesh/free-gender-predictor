#!/usr/bin/env node
/**
 * Pre-computes Chinese New Year dates for years 1940-2040.
 * CNY = 1st day of 1st lunar month for each lunar year.
 * Run once: node scripts/generate-cny-dates.mjs
 * Outputs: src/data/cny-dates.json
 */
import { Lunar } from 'lunar-javascript';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'src', 'data');
const outFile = join(outDir, 'cny-dates.json');

mkdirSync(outDir, { recursive: true });

const START_LUNAR_YEAR = 1950;
const END_LUNAR_YEAR = 2035;

const data = {};

for (let lunarYear = START_LUNAR_YEAR; lunarYear <= END_LUNAR_YEAR; lunarYear++) {
  // 1st day of 1st lunar month
  const lunar = Lunar.fromYmd(lunarYear, 1, 1);
  const solar = lunar.getSolar();
  data[lunarYear] = solar.toYmd();
}

writeFileSync(outFile, JSON.stringify(data, null, 2));
console.log(`Generated CNY dates for lunar years ${START_LUNAR_YEAR}-${END_LUNAR_YEAR} → ${outFile}`);
console.log(`File size: ${(Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(1)} KB`);
