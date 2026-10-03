import { en } from '../src/i18n/en';
import { LOCALES, localDigits, type Locale } from '../src/i18n/locales';
import { addStandalonePerson } from '../src/model/mutations';
import type { FamilyData } from '../src/types';

/**
 * Every language file (src/i18n/<code>.ts): no empty phrase, the same
 * {placeholders} as English, and new-person numbering that carries on when
 * the language changes. Typecheck already makes sure every phrase exists.
 */
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }
}

const catalogs = new Map<Locale, Record<string, string>>(LOCALES.map((l) => [l.code, require(`../src/i18n/${l.code}.ts`)[l.code]]));
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

for (const [code, catalog] of catalogs) {
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    const value = catalog[key];
    assert(typeof value === 'string' && value.trim().length > 0, `${code}.${key} is empty`);
    assert(placeholders(value ?? '') === placeholders(en[key]), `${code}.${key} has different {placeholders} from English`);
  }
}

// Make one new person in each language, in turn, on the same tree: every
// number is one past the last, whichever language made the earlier ones.
let data: FamilyData = { people: [], marriages: [] };
const knownLabels = [...new Set([...catalogs.values()].map((c) => c.newPersonLabel))];
LOCALES.forEach((l, i) => {
  const catalog = catalogs.get(l.code)!;
  data = addStandalonePerson(data, { label: catalog.newPersonLabel, formatNumber: (n) => localDigits(n, l.code), knownLabels }).data;
  const made = data.people[data.people.length - 1].name;
  assert(made === `${catalog.newPersonLabel} ${localDigits(i + 1, l.code)}`, `new person ${i + 1} in ${l.code} is "${made}"`);
});

console.log(process.exitCode ? 'language files: problems found' : `ok  : all ${catalogs.size} languages have every phrase with matching {placeholders}, and numbering carries on across languages`);
