import { isoToJalali, jalaliToIso, formatJalali, jalaliWeekdayIndex, jalaliMonthLength, todayJalali } from '../src/utils/jalali';
import { calendarFor, marriageYearForDisplay, marriageYearForStorage } from '../src/utils/calendar';
import { localDigits, toAsciiDigits } from '../src/i18n/locales';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok  :', msg);
  }
}

// Well-known reference point: 1979-02-11 (Gregorian) = 1357-11-22 (Jalali), the day of the Iranian revolution.
const d = isoToJalali('1979-02-11');
assert(!!d && d.jy === 1357 && d.jm === 11 && d.jd === 22, `1979-02-11 -> ${JSON.stringify(d)}`);

const backToIso = jalaliToIso(1357, 11, 22);
assert(backToIso === '1979-02-11', `round-trip back to ISO -> ${backToIso}`);

assert(formatJalali('1985-05-17') === '۱۳۶۴/۲/۲۷', `formatJalali(1985-05-17) -> ${formatJalali('1985-05-17')}`);

// Farvardin 1 is always day 1 of the Jalali year — weekday should be a valid 0..6.
const wd = jalaliWeekdayIndex(1400, 1, 1);
assert(wd >= 0 && wd <= 6, `weekday index in range -> ${wd}`);

assert(jalaliMonthLength(1400, 1) === 31, 'Farvardin (month 1) has 31 days');
assert(jalaliMonthLength(1400, 12) === 30 || jalaliMonthLength(1400, 12) === 29, 'Esfand (month 12) has 29 or 30 days');

const today = todayJalali();
assert(today.jy > 1300 && today.jy < 1500, `today's Jalali year looks sane -> ${today.jy}`);

// Shamsi only for Persian; Gregorian for every other language.
{
  const fa = calendarFor('fa');
  const en = calendarFor('en');
  const de = calendarFor('de');
  assert(fa.kind === 'shamsi' && en.kind === 'gregorian' && calendarFor('ar').kind === 'gregorian', 'Persian is Shamsi, English and Arabic are Gregorian');
  assert(fa.format('1985-05-17') === '۱۳۶۴/۲/۲۷', `Persian keeps its Shamsi format -> ${fa.format('1985-05-17')}`);
  assert(/1985/.test(en.format('1985-05-17') ?? '') && /17/.test(en.format('1985-05-17') ?? ''), `English shows a Gregorian date -> ${en.format('1985-05-17')}`);
  assert(en.monthLength(2024, 2) === 29 && en.monthLength(2023, 2) === 28 && en.monthLength(2023, 4) === 30, 'Gregorian month lengths, with leap years');
  assert(en.weekColumn(2001, 1, 7) === 0 && de.weekColumn(2001, 1, 8) === 0, 'the week starts on Sunday in English and Monday in German');
  assert(en.toIso(1985, 5, 7) === '1985-05-07' && JSON.stringify(en.fromIso('1985-05-07')) === JSON.stringify({ y: 1985, m: 5, d: 7 }), 'Gregorian dates go to and from ISO unchanged');
  assert(en.monthNames.length === 12 && en.weekdayShort.length === 7, 'twelve month names and seven weekday names');
  assert(calendarFor('ar').digits(1985) === '١٩٨٥' && localDigits(12, 'fa') === '۱۲' && toAsciiDigits('۱۳۷۰') === '1370', 'Arabic and Persian digits, and back');
}

// Marriage years are stored Shamsi; other languages show and take Gregorian.
{
  assert(marriageYearForDisplay(1369, 'fa') === 1369 && marriageYearForDisplay(1369, 'en') === 1990, 'stored 1369 shows as 1369 in Persian and 1990 in English');
  assert(marriageYearForStorage(1990, 'en') === 1369 && marriageYearForStorage(1369, 'fa') === 1369, 'and typed years store back the same way');
  assert(marriageYearForDisplay(marriageYearForStorage(2001, 'de'), 'de') === 2001, 'a year typed in German reads back the same');
}

process.exit(process.exitCode ?? 0);
