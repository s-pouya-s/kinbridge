import { normalizeFamilyData } from '../src/storage/migrate';
import type { FamilyData } from '../src/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok  :', msg);
  }
}

// Simulates data saved before born/died were dates (the exact shape that crashed order.ts's .localeCompare).
const legacy = {
  people: [
    { id: 'a', name: 'A', born: 1985 as unknown as string, died: 2020 as unknown as string },
    { id: 'b', name: 'B', born: '1990-05-01' }, // already-migrated shape should pass through untouched
    { id: 'c', name: 'C' }, // no dates at all
  ],
  marriages: [],
} as unknown as FamilyData;

const migrated = normalizeFamilyData(legacy);

assert(migrated.people[0].born === '1985-01-01', `legacy numeric born -> ISO, got "${migrated.people[0].born}"`);
assert(migrated.people[0].died === '2020-01-01', `legacy numeric died -> ISO, got "${migrated.people[0].died}"`);
assert(migrated.people[1].born === '1990-05-01', 'already-ISO born is left untouched');
assert(migrated.people[1] === legacy.people[1], 'unchanged person keeps the same object reference (no needless copy)');
assert(migrated.people[2].born === undefined && migrated.people[2].died === undefined, 'a person with no dates stays that way');

// A fixed runaway bug in computeGenerations used to let Person.manualGeneration
// (set by the ▲▼ arrows, which seed from whatever it currently reports) get
// saved with an absurd value like 145 — normalizeFamilyData has to clean that
// up on load, or the same runaway-looking layout comes right back even after
// the underlying bug is fixed, since the bogus seed itself is what's replayed.
{
  const corrupted = {
    people: [
      { id: 'a', name: 'A', manualGeneration: 145 }, // only 3 people total -> clearly not a real generation
      { id: 'b', name: 'B', manualGeneration: 2 }, // small and plausible -> left alone
      { id: 'c', name: 'C' },
    ],
    marriages: [],
  } as FamilyData;

  const fixed = normalizeFamilyData(corrupted);
  assert(fixed.people[0].manualGeneration === undefined, `an absurdly large manualGeneration is cleared -> got ${fixed.people[0].manualGeneration}`);
  assert(fixed.people[1].manualGeneration === 2, 'a plausible manualGeneration is left as-is');
  assert(fixed.people[1] === corrupted.people[1], 'and that unaffected person keeps the same object reference (no needless copy)');
}

process.exit(process.exitCode ?? 0);
