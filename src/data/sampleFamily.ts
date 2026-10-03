import type { FamilyData } from '../types';

/**
 * The family a brand new install opens on, in Persian: three generations,
 * so the first screen already shows what the tree does. A couple (both
 * passed away, so the mourning ribbon shows too), their son and daughter,
 * the son's wife, and their grandchild, and the daughter's ended marriage
 * with their own child. Birth and death dates are stored
 * Gregorian ISO like everywhere else in the data (see Person.born), picked
 * to land on round Shamsi dates (1317/1/1, 1394/7/13, ...); marriage years
 * are Shamsi, as the marriage form takes them.
 */
export const sampleFamily: FamilyData = {
  people: [
    {
      id: 'elias',
      name: 'الیاس',
      surname: 'امینی',
      gender: 'male',
      born: '1938-03-21',
      died: '2015-10-05',
      deceased: true,
      birthPlace: 'شیراز',
      gravePlace: 'شیراز، آرامستان دارالرحمه',
      notes: 'پدربزرگ خانواده؛ معلم بازنشسته.',
    },
    {
      id: 'maral',
      name: 'مارال',
      surname: 'امینی',
      gender: 'female',
      born: '1941-07-12',
      died: '2020-01-18',
      deceased: true,
      birthPlace: 'اصفهان',
      gravePlace: 'اصفهان، تخت فولاد',
      notes: 'عاشق باغبانی و شعر بود.',
    },
    { id: 'dara', name: 'دارا', surname: 'امینی', gender: 'male', born: '1963-05-02', birthPlace: 'شیراز', notes: 'مهندس عمران؛ ساکن تهران.' },
    { id: 'leyla', name: 'لیلا', surname: 'رحیمی', gender: 'female', born: '1966-11-20', birthPlace: 'تهران', notes: 'معلم ادبیات.' },
    { id: 'noor', name: 'نور', surname: 'امینی', gender: 'female', born: '1967-09-08', birthPlace: 'شیراز', notes: 'پزشک؛ کوچک‌ترین فرزند خانواده.' },
    { id: 'kian', name: 'کیان', surname: 'امینی', gender: 'male', born: '1994-02-14', birthPlace: 'تهران', notes: 'نوهٔ الیاس و مارال.' },
    { id: 'bahram', name: 'بهرام', surname: 'نادری', gender: 'male', born: '1964-08-17', birthPlace: 'تهران' },
    { id: 'ava', name: 'آوا', surname: 'نادری', gender: 'female', born: '1993-06-11', birthPlace: 'تهران', notes: 'دختر نور و بهرام.' },
  ],
  marriages: [
    { id: 'm-elias-maral', spouseIds: ['elias', 'maral'], status: 'current', marriedYear: 1339, childIds: ['dara', 'noor'] },
    { id: 'm-dara-leyla', spouseIds: ['dara', 'leyla'], status: 'current', marriedYear: 1369, childIds: ['kian'] },
    // An ended marriage, so a new install shows how one looks (dashed red lines, ✕ on its marker).
    { id: 'm-noor-bahram', spouseIds: ['noor', 'bahram'], status: 'ended', marriedYear: 1370, endedYear: 1376, childIds: ['ava'] },
  ],
};

/**
 * The same family shape for the Galaxy Store build, which opens in English
 * (or the phone's language): made-up English names, Gregorian-friendly
 * dates. Marriage years are stored Shamsi like everywhere else (see
 * marriageYearForDisplay): 1339 shows as 1960, 1369 as 1990, and so on.
 */
export const sampleFamilyEnglish: FamilyData = {
  people: [
    { id: 'elias', name: 'Elias', surname: 'Carter', gender: 'male', born: '1938-03-21', died: '2015-10-05', deceased: true, birthPlace: 'Boston', gravePlace: 'Boston, Forest Hills Cemetery', notes: 'Grandfather of the family; a retired teacher.' },
    { id: 'maral', name: 'Mara', surname: 'Carter', gender: 'female', born: '1941-07-12', died: '2020-01-18', deceased: true, birthPlace: 'Portland', gravePlace: 'Portland, Riverview Cemetery', notes: 'Loved gardening and poetry.' },
    { id: 'dara', name: 'Daniel', surname: 'Carter', gender: 'male', born: '1963-05-02', birthPlace: 'Boston', notes: 'Civil engineer; lives in Chicago.' },
    { id: 'leyla', name: 'Laura', surname: 'Bennett', gender: 'female', born: '1966-11-20', birthPlace: 'Chicago', notes: 'Literature teacher.' },
    { id: 'noor', name: 'Nora', surname: 'Carter', gender: 'female', born: '1967-09-08', birthPlace: 'Boston', notes: 'Doctor; the youngest of the family.' },
    { id: 'kian', name: 'Kevin', surname: 'Carter', gender: 'male', born: '1994-02-14', birthPlace: 'Chicago', notes: 'Grandson of Elias and Mara.' },
    { id: 'bahram', name: 'Bruce', surname: 'Hayes', gender: 'male', born: '1964-08-17', birthPlace: 'Denver' },
    { id: 'ava', name: 'Ava', surname: 'Hayes', gender: 'female', born: '1993-06-11', birthPlace: 'Denver', nickname: 'Avie', notes: 'Daughter of Nora and Bruce.' },
  ],
  marriages: sampleFamily.marriages,
};
