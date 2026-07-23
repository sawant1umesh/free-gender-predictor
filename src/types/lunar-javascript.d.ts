declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number
    ): Solar;
    static fromDate(date: Date): Solar;
    static fromJulianDay(julianDay: number): Solar;

    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getHour(): number;
    getMinute(): number;
    getSecond(): number;
    getWeek(): number;
    getWeekInChinese(): string;
    isLeapYear(): boolean;
    toYmd(): string;
    toYmdHms(): string;
    getLunar(): Lunar;
    subtract(solar: Solar): number;
    next(days: number): Solar;
  }

  export class Lunar {
    static fromSolar(solar: Solar): Lunar;
    static fromYmd(year: number, month: number, day: number): Lunar;
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number
    ): Lunar;

    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getHour(): number;
    getMinute(): number;
    getSecond(): number;

    getYearInGanZhi(): string;
    getYearGan(): string;
    getYearZhi(): string;
    getYearShengXiao(): string;

    getMonthInGanZhi(): string;
    getMonthInChinese(): string;

    getDayInGanZhi(): string;
    getDayInChinese(): string;

    getYearInChinese(): string;
    getSolar(): Solar;
    toFullString(): string;
    toString(): string;
  }

  export class LunarMonth {
    static fromYm(year: number, month: number): LunarMonth | null;
    getYear(): number;
    getMonth(): number;
    getDayCount(): number;
    isLeap(): boolean;
  }

  export class LunarYear {
    static fromYear(year: number): LunarYear;
    getYear(): number;
    getGan(): string;
    getZhi(): string;
    getGanZhi(): string;
    getDayCount(): number;
    getMonths(): LunarMonth[];
    getMonthsInYear(): LunarMonth[];
    getLeapMonth(): number;
  }

  export class SolarUtil {
    static isLeapYear(year: number): boolean;
    static getDaysOfMonth(year: number, month: number): number;
  }

  export class LunarUtil {
    static GAN: string[];
    static ZHI: string[];
    static SHENGXIAO: string[];
    static NUMBER: string[];
    static MONTH: string[];
    static DAY: string[];
  }
}
