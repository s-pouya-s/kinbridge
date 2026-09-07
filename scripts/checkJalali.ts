import { isoToJalali, jalaliToIso, formatJalali, jalaliWeekdayIndex, jalaliMonthLength, todayJalali } from '../src/utils/jalali';

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

process.exit(process.exitCode ?? 0);
