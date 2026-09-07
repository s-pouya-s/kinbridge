import { toJalaali, toGregorian, isLeapJalaaliYear, jalaaliMonthLength, jalaaliToDateObject } from 'jalaali-js';

export interface JalaliYMD {
  jy: number;
  jm: number;
  jd: number;
}

/** Dates are always stored as Gregorian ISO ("YYYY-MM-DD") — portable, sortable,
 * and calendar-agnostic. The Shamsi calendar is purely an input/display concern,
 * handled by this module and ShamsiDatePicker. */
export type IsoDate = string;

export const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/** Iranian week starts Saturday. */
export const JALALI_WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isoToJalali(iso?: IsoDate): JalaliYMD | undefined {
  if (!iso) return undefined;
  const [gy, gm, gd] = iso.split('-').map(Number);
  if (!gy || !gm || !gd) return undefined;
  return toJalaali(gy, gm, gd);
}

export function jalaliToIso(jy: number, jm: number, jd: number): IsoDate {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${String(gy).padStart(4, '0')}-${pad2(gm)}-${pad2(gd)}`;
}

export function todayJalali(): JalaliYMD {
  const now = new Date();
  return toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** 0 = Saturday … 6 = Friday, matching JALALI_WEEKDAY_SHORT's order. */
export function jalaliWeekdayIndex(jy: number, jm: number, jd: number): number {
  const jsDay = jalaaliToDateObject(jy, jm, jd).getDay(); // 0 = Sunday … 6 = Saturday
  return (jsDay + 1) % 7;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm);
}

/** e.g. "۱۳۶۴/۲/۱" — Persian digits, no leading zeros (matches how Iranians actually write dates). */
export function formatJalali(iso?: IsoDate): string | undefined {
  const d = isoToJalali(iso);
  if (!d) return undefined;
  return toPersianDigits(`${d.jy}/${d.jm}/${d.jd}`);
}

export { isLeapJalaaliYear };
