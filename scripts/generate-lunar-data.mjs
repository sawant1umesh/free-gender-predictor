#!/usr/bin/env node
/**
 * Pre-computes lunar calendar data for years 2020-2035.
 * Run once: node scripts/generate-lunar-data.mjs
 * Outputs: src/data/lunar-months.json (used by engine at runtime)
 */
import { LunarYear, Lunar, Solar } from 'lunar-javascript';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'src', 'data');
const outFile = join(outDir, 'lunar-months.json');

mkdirSync(outDir, { recursive: true });

const START_YEAR = 1950;
const END_YEAR = 2035;

const data = {};

for (let year = START_YEAR; year <= END_YEAR; year++) {
  const lunarYear = LunarYear.fromYear(year);
  const months = lunarYear.getMonthsInYear();
  const leapMonth = lunarYear.getLeapMonth();

  data[year] = {
    leapMonth,
    months: months.map((m) => {
      const rawMonth = m.getMonth();
      const isLeap = m.isLeap();
      const absMonth = Math.abs(rawMonth);
      const dayCount = m.getDayCount();

      const startLunar = Lunar.fromYmd(year, rawMonth, 1);
      const endLunar = Lunar.fromYmd(year, rawMonth, dayCount);

      return {
        month: rawMonth,
        isLeap,
        absMonth,
        dayCount,
        gregorianStart: startLunar.getSolar().toYmd(),
        gregorianEnd: endLunar.getSolar().toYmd(),
      };
    }),
  };
}

writeFileSync(outFile, JSON.stringify(data, null, 2));
console.log(`Generated lunar data for ${START_YEAR}-${END_YEAR} → ${outFile}`);
console.log(`File size: ${(Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(1)} KB`);
