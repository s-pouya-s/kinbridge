import { localDigits, type Locale } from '../i18n/locales';
import { formatJalali, isoToJalali, JALALI_MONTH_NAMES, JALALI_WEEKDAY_SHORT, jalaliMonthLength, jalaliToIso, jalaliWeekdayIndex, todayJalali, type IsoDate } from './jalali';

/**
 * The calendar dates are shown and picked in. Shamsi only for Persian;
 * every other language uses the Gregorian calendar. Either way, dates are
 * stored as Gregorian ISO "YYYY-MM-DD" (see Person.born): this only changes
 * how they're shown and picked. Pure (no React Native), so the PDF and the
 * checks use it too.
 */
export interface YMD {
  y: number;
  m: number;
  d: number;
}

export interface Calendar {
  kind: 'shamsi' | 'gregorian';
  fromIso(iso?: IsoDate): YMD | undefined;
  toIso(y: number, m: number, d: number): IsoDate;
  today(): YMD;
  monthLength(y: number, m: number): number;
  /** Which column (0-6) of the week grid a day falls in, counted from weekdayShort[0]. */
  weekColumn(y: number, m: number, d: number): number;
  monthNames: string[];
  /** The week grid's column headings, from the first day of the week. */
  weekdayShort: string[];
  /** A date for reading: «۱۳۶۴/۲/۲۷» in Persian, "17 May 1985" style elsewhere. */
  format(iso?: IsoDate): string | undefined;
  /** Just the year, in this language's digits. */
  year(iso?: IsoDate): string | undefined;
  /** A number in this language's digits. */
  digits(n: number | string): string;
}

const ENGLISH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ENGLISH_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The first day of the week: Sunday for English and Arabic, Monday for the rest. */
function weekStart(locale: Locale): number {
  return locale === 'en' || locale === 'ar' ? 0 : 1;
}

/** Month or weekday names from the phone's own Intl, in English when it can't give them. */
function intlNames(locale: Locale, kind: 'month' | 'weekday'): string[] {
  try {
    if (kind === 'month') {
      const f = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
      return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2001, i, 15))));
    }
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    // 2001-01-07 was a Sunday.
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2001, 0, 7 + i))));
  } catch {
    return kind === 'month' ? ENGLISH_MONTHS : ENGLISH_WEEKDAYS;
  }
}

const cache = new Map<Locale, Calendar>();

export function calendarFor(locale: Locale): Calendar {
  const cached = cache.get(locale);
  if (cached) return cached;
  const digits = (n: number | string) => localDigits(n, locale);
  let calendar: Calendar;
  if (locale === 'fa') {
    calendar = {
      kind: 'shamsi',
      fromIso: (iso) => {
        const j = isoToJalali(iso);
        return j ? { y: j.jy, m: j.jm, d: j.jd } : undefined;
      },
      toIso: jalaliToIso,
      today: () => {
        const j = todayJalali();
        return { y: j.jy, m: j.jm, d: j.jd };
      },
      monthLength: jalaliMonthLength,
      weekColumn: jalaliWeekdayIndex,
      monthNames: JALALI_MONTH_NAMES,
      weekdayShort: JALALI_WEEKDAY_SHORT,
      format: formatJalali,
      year: (iso) => {
        const j = isoToJalali(iso);
        return j ? digits(j.jy) : undefined;
      },
      digits,
    };
  } else {
    const start = weekStart(locale);
    const weekdays = intlNames(locale, 'weekday');
    const fromIso = (iso?: IsoDate): YMD | undefined => {
      if (!iso) return undefined;
      const [y, m, d] = iso.split('-').map(Number);
      return y && m && d ? { y, m, d } : undefined;
    };
    let formatter: Intl.DateTimeFormat | undefined;
    try {
      formatter = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
    } catch {
      formatter = undefined;
    }
    calendar = {
      kind: 'gregorian',
      fromIso,
      toIso: (y, m, d) => `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`,
      today: () => {
        const now = new Date();
        return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
      },
      monthLength: (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(),
      weekColumn: (y, m, d) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() - start + 7) % 7,
      monthNames: intlNames(locale, 'month'),
      weekdayShort: [...weekdays.slice(start), ...weekdays.slice(0, start)],
      format: (iso) => {
        const ymd = fromIso(iso);
        if (!ymd) return undefined;
        if (formatter) {
          try {
            return formatter.format(new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)));
          } catch {
            // Falls through to the plain form below.
          }
        }
        return digits(`${ymd.y}/${ymd.m}/${ymd.d}`);
      },
      year: (iso) => {
        const ymd = fromIso(iso);
        return ymd ? digits(ymd.y) : undefined;
      },
      digits,
    };
  }
  cache.set(locale, calendar);
  return calendar;
}

/**
 * Marriage years are stored as Shamsi years (Marriage.marriedYear). Other
 * languages show and take Gregorian years: the Shamsi year starts in March,
 * so Gregorian = Shamsi + 621, the same rule both ways, so a year typed in
 * one language reads back the same in it.
 */
export function marriageYearForDisplay(stored: number | undefined, locale: Locale): number | undefined {
  if (stored == null) return undefined;
  return locale === 'fa' ? stored : stored + 621;
}

export function marriageYearForStorage(typed: number | undefined, locale: Locale): number | undefined {
  if (typed == null || Number.isNaN(typed)) return undefined;
  return locale === 'fa' ? typed : typed - 621;
}
