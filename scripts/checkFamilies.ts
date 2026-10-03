import type { FamilyData } from '../src/types';
import { sampleFamily, sampleFamilyEnglish } from '../src/data/sampleFamily';
import { richFamily } from './fixtures/richFamily';
import { familyProblems, personTreeProblems } from './lib/familyRules';

/**
 * Runs every layout rule (scripts/lib/familyRules.ts) over all 400 test
 * families in test-families/ (see scripts/generateFamilies.ts), plus the
 * built-in sample family and the rich fixture, and over the one-person view
 * of three people in each. Also makes sure the families
 * still cover every kind of situation, so a change to the generator can't
 * quietly stop testing one. Runs before every commit (.githooks/pre-commit).
 */
const fs = require('fs') as { readdirSync(p: string): string[]; readFileSync(p: string, e: string): string };

const DIR = 'test-families';
const SITUATIONS = [
  'child moved down by hand',
  'cousin marriage',
  'ended marriage with children',
  'founding families married into each other',
  '10 or more generations',
  '150 or more people',
  '450 or more people',
  '5 generations, 300 or more people',
  'very long name',
  '8 or more children',
  'both spouses have parents',
  'ended marriage',
  'hand-set child order',
  'hand-set generation',
  'marriage with no children',
  'nickname',
  'twins',
  'three or more born together',
  'five born together',
  'name in another script',
  'no gender',
  'outsider married into two lines',
  'person on their own',
  'placeholder spouse',
  'remarriage',
  'several founding families',
  'single person',
  'spouses from different generations',
];

const families: { name: string; situations: string[]; data: FamilyData }[] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8')));
families.push({ name: 'built-in sample family', situations: [], data: sampleFamily });
families.push({ name: 'English sample family (Galaxy Store)', situations: [], data: sampleFamilyEnglish });
families.push({ name: 'rich fixture', situations: [], data: richFamily });

let failed = 0;
const started = Date.now();
for (const family of families) {
  // The family itself, then the one-person view of three of its people
  // (first, middle, last: every person in all 400 would take minutes).
  const people = family.data.people;
  const focus = [...new Set([people[0], people[Math.floor(people.length / 2)], people[people.length - 1]].filter(Boolean).map((p) => p.id))];
  const problems = [...familyProblems(family.data), ...focus.flatMap((id) => personTreeProblems(family.data, id))];
  if (problems.length === 0) continue;
  failed++;
  console.error(`FAIL: ${family.name}`);
  for (const p of problems.slice(0, 5)) console.error(`  ${p}`);
  if (problems.length > 5) console.error(`  ...and ${problems.length - 5} more`);
}

if (families.length < 403) {
  failed++;
  console.error(`FAIL: expected 400 test families in ${DIR}/, found ${families.length - 3}`);
}
const covered = new Map(SITUATIONS.map((s) => [s, families.filter((f) => f.situations.includes(s)).length]));
for (const [situation, n] of covered) {
  if (n < 3) {
    failed++;
    console.error(`FAIL: only ${n} test families have "${situation}"`);
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(failed > 0 ? `${failed} problems found (${seconds}s)` : `ok  : all ${families.length} families follow every layout rule (${seconds}s)`);
if (failed > 0) process.exitCode = 1;
