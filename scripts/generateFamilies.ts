import type { FamilyData, ID, Marriage, Person } from '../src/types';

/**
 * Writes the 400 test families in test-families/, from one person up to
 * 500, including very deep and very wide ones, covering every kind of family the app has to draw: marriages
 * across generations, cousin marriages, families marrying into each other,
 * remarriages (ended and current), someone who married into two different
 * families, placeholder spouses, missing gender and dates, hand-set child
 * order and generations, very big families, and several separate families
 * in one tree. All names are made up.
 *
 * Seeded, so running it again writes exactly the same files:
 *   npx tsx scripts/generateFamilies.ts
 * Only rerun it to change the families on purpose; scripts/checkFamilies.ts
 * tests whatever is in the folder.
 */
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string): void; readdirSync(p: string): string[]; unlinkSync(p: string): void };
const path = require('path') as { join(...p: string[]): string };

const COUNT = 400;
// Run from the project root (npm scripts always are).
const OUT = 'test-families';

const FIRST_M = ['Adam', 'Ben', 'Cyrus', 'Dan', 'Eli', 'Farid', 'Gil', 'Hugo', 'Ivan', 'Jon', 'Karl', 'Leo', 'Milo', 'Nate', 'Omar', 'Paul', 'Rex', 'Sam', 'Theo', 'Ugo', 'Vic', 'Will', 'Yan', 'Zed'];
const FIRST_F = ['Ada', 'Bea', 'Cora', 'Dina', 'Eva', 'Fay', 'Gia', 'Hana', 'Iris', 'June', 'Kira', 'Lina', 'Mia', 'Nora', 'Opal', 'Pia', 'Rosa', 'Sara', 'Tara', 'Una', 'Vera', 'Wren', 'Yara', 'Zoe'];
/** Very long names, to test that text never runs past a card's edge. */
const LONG_FIRST = ['Bartholomew-Alexander', 'Maximiliana Seraphina', 'Wolfgang Amadeus Theodor', 'Anastasiya-Konstantina', 'Christopherson', 'Evangelina Rosalind Marie', 'Montgomery-Fitzwilliam', 'Wilhelmina Charlotte'];
const LONG_SURNAMES = ['Featherstonehaugh-Montmorency', 'Vanderbilt-Rockefeller-Astor', 'Wolfeschlegelsteinhausen', 'Ravenscroft-Ashworth'];
const SURNAMES = ['Ash', 'Birch', 'Cedar', 'Dale', 'Elm', 'Fern', 'Glen', 'Heath', 'Ivy', 'Juniper', 'Knoll', 'Larch', 'Moss', 'North', 'Oak', 'Pine', 'Quill', 'Reed', 'Stone', 'Thorn', 'Vale', 'Wood'];

/** mulberry32: a small seeded random number generator. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TestFamily {
  name: string;
  /** What this family contains, so the check can make sure every situation stays covered. */
  situations: string[];
  data: FamilyData;
}

function makeFamily(index: number): TestFamily {
  const r = rng(1000 + index * 7919);
  const chance = (p: number) => r() < p;
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  // Three kinds of family: mixed (1 to 500 people), deep (10 to 18
  // generations, few children each) and wide (at most 5 generations, up to
  // 500 people, many children each).
  const kind = index < 300 ? 'mixed' : index < 350 ? 'deep' : 'wide';
  const target =
    kind === 'mixed'
      ? Math.round(1 + Math.pow(index / 299, 1.6) * 499)
      : kind === 'deep'
        ? 40 + Math.round(((index - 300) / 49) * 260)
        : 150 + Math.round(((index - 350) / 49) * 350);
  const maxDepth = kind === 'mixed' ? 7 : kind === 'deep' ? 10 + Math.floor(r() * 9) : 4;

  const people: Person[] = [];
  const marriages: Marriage[] = [];
  const depth = new Map<ID, number>();
  const parentsOf = new Map<ID, ID[]>();
  const familyOf = new Map<ID, number>();
  let nextId = 0;

  const newPerson = (gen: number, surname: string | undefined, family: number, outsider = false): ID => {
    const id = `p${nextId++}`;
    const gender = chance(0.08) ? undefined : chance(0.5) ? 'male' : 'female';
    const person: Person = { id, name: chance(0.06) ? pick(LONG_FIRST) : pick(gender === 'female' ? FIRST_F : FIRST_M), gender };
    if (surname && !(outsider && chance(0.3))) person.surname = outsider ? (chance(0.05) ? pick(LONG_SURNAMES) : pick(SURNAMES)) : surname;
    if (chance(0.6)) {
      const year = 1900 + gen * 26 + Math.floor(r() * 16) - 8;
      person.born = `${year}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`;
    }
    if (gen <= 1 && chance(0.5)) person.deceased = true;
    if (chance(0.03)) person.name = `Unnamed ${nextId}`;
    people.push(person);
    depth.set(id, gen);
    familyOf.set(id, family);
    return id;
  };
  const marry = (a: ID, b: ID, status: Marriage['status'] = 'current'): Marriage => {
    const m: Marriage = { id: `m${marriages.length}`, spouseIds: [a, b], status, childIds: [] };
    if (chance(0.3)) m.marriedYear = 1300 + Math.floor(r() * 100);
    marriages.push(m);
    return m;
  };
  const addChildren = (m: Marriage, count: number) => {
    const gen = Math.max(depth.get(m.spouseIds[0])!, depth.get(m.spouseIds[1])!) + 1;
    const father = m.spouseIds.map((id) => people.find((p) => p.id === id)!).find((p) => p.gender === 'male');
    for (let i = 0; i < count && people.length < target; i++) {
      const id = newPerson(gen, father?.surname ?? pick(SURNAMES), familyOf.get(m.spouseIds[0])!);
      m.childIds.push(id);
      parentsOf.set(id, m.spouseIds);
    }
  };
  const childCount = () => {
    const x = r();
    if (kind === 'deep') return 1 + Math.floor(r() * 3);
    if (kind === 'wide') return x < 0.1 ? 0 : 5 + Math.floor(r() * 10);
    return x < 0.15 ? 0 : x < 0.75 ? 1 + Math.floor(r() * 4) : x < 0.95 ? 4 + Math.floor(r() * 4) : 8 + Math.floor(r() * 6);
  };
  const ancestorsOf = (id: ID): Set<ID> => {
    const out = new Set<ID>();
    const stack = [...(parentsOf.get(id) ?? [])];
    while (stack.length) {
      const p = stack.pop()!;
      if (out.has(p)) continue;
      out.add(p);
      stack.push(...(parentsOf.get(p) ?? []));
    }
    return out;
  };
  const marriedTo = (a: ID, b: ID) => marriages.some((m) => m.spouseIds.includes(a) && m.spouseIds.includes(b));
  const marriageCount = (id: ID) => marriages.filter((m) => m.spouseIds.includes(id)).length;

  // One to three separate founding families.
  const roots = 1 + (chance(0.25) ? 1 : 0) + (chance(0.08) ? 1 : 0);
  for (let f = 0; f < roots && people.length < target; f++) {
    const surname = pick(SURNAMES);
    const gen = f > 0 && chance(0.4) ? 1 : 0;
    const founder = newPerson(gen, surname, f);
    if (people.length < target && chance(0.85)) {
      const m = marry(founder, chance(0.04) ? newUnknown(gen, f) : newPerson(gen, surname, f, true));
      addChildren(m, Math.max(1, childCount()));
    }
  }
  function newUnknown(gen: number, family: number): ID {
    const id = newPerson(gen, undefined, family, true);
    const p = people.find((q) => q.id === id)!;
    p.unknown = true;
    delete p.gender;
    delete p.born;
    return id;
  }

  // Grow the tree until it reaches its size.
  let guard = 0;
  while (people.length < target && guard++ < target * 20) {
    const blood = people.filter((p) => !p.unknown && (parentsOf.has(p.id) || depth.get(p.id) === 0) && marriageCount(p.id) < 3 && depth.get(p.id)! < maxDepth);
    if (blood.length === 0) break;
    // Deep families grow from their deepest people, so they keep going down.
    const deepest = Math.max(...blood.map((p) => depth.get(p.id)!));
    const person = (kind === 'deep' && chance(0.7) ? pick(blood.filter((p) => depth.get(p.id)! >= deepest - 1)) : pick(blood)).id;
    const gen = depth.get(person)!;
    const remarrying = marriageCount(person) > 0;
    const status: Marriage['status'] = remarrying && chance(0.6) ? 'ended' : 'current';
    if (remarrying) for (const m of marriages) if (m.spouseIds.includes(person) && chance(0.6)) m.status = 'ended';
    const x = r();
    let spouse: ID | undefined;
    if (x < 0.16) {
      // Someone already in the tree: a cousin, a relative a generation or two
      // away, or someone from another founding family. Never a sibling, an
      // ancestor, a descendant or a current spouse.
      const mine = ancestorsOf(person);
      const candidates = people.filter(
        (p) =>
          p.id !== person &&
          !p.unknown &&
          parentsOf.has(p.id) &&
          !marriedTo(person, p.id) &&
          !mine.has(p.id) &&
          !ancestorsOf(p.id).has(person) &&
          parentsOf.get(p.id)?.join() !== parentsOf.get(person)?.join() &&
          Math.abs(depth.get(p.id)! - gen) <= (kind === 'wide' ? 0 : 2) &&
          marriageCount(p.id) < 2
      );
      if (candidates.length > 0) spouse = pick(candidates).id;
    } else if (x < 0.21) {
      spouse = newUnknown(gen, familyOf.get(person)!);
    } else if (x < 0.26) {
      // An outsider who already married into another line.
      const outsiders = people.filter((p) => !parentsOf.has(p.id) && depth.get(p.id)! > 0 && !p.unknown && marriageCount(p.id) === 1 && !marriedTo(person, p.id));
      if (outsiders.length > 0) spouse = pick(outsiders).id;
    }
    if (!spouse) {
      spouse = newPerson(gen, pick(SURNAMES), familyOf.get(person)!, true);
    }
    const m = marry(person, spouse, status);
    addChildren(m, childCount());
  }

  // Hand-set child order on some marriages, as the edit form does.
  for (const m of marriages) {
    if (m.childIds.length > 1 && chance(0.12)) {
      m.childIds = [...m.childIds].reverse();
      m.manualChildOrder = true;
    }
  }
  // Hand-set generations, as on real trees: an outsider or founder lined up
  // with their spouse's row, or a person nudged down a row.
  for (const p of people) {
    const outsider = !parentsOf.has(p.id);
    // (Wide families keep exactly 5 generations, so nobody is nudged down there.)
    if ((outsider && depth.get(p.id)! > 0 && chance(0.15)) || (!outsider && kind !== 'wide' && chance(0.02))) p.manualGeneration = depth.get(p.id)! + (outsider ? 0 : 1);
    if (chance(0.04)) p.manualOrder = Math.floor(r() * 40) - 5;
  }
  // Now and then someone on their own, not connected to anyone.
  if (people.length > 5 && chance(0.06)) newPerson(Math.floor(r() * 3), pick(SURNAMES), 99);

  const data: FamilyData = { people, marriages };
  return { name: `family ${String(index + 1).padStart(3, '0')} (${people.length} people)`, situations: situationsOf(data, parentsOf, depth, roots), data };
}

function situationsOf(data: FamilyData, parentsOf: Map<ID, ID[]>, depth: Map<ID, number>, roots: number): string[] {
  const out = new Set<string>();
  const count = new Map<ID, number>();
  for (const m of data.marriages) for (const id of m.spouseIds) count.set(id, (count.get(id) ?? 0) + 1);
  for (const m of data.marriages) {
    const [a, b] = m.spouseIds;
    if (parentsOf.has(a) && parentsOf.has(b)) {
      out.add('both spouses have parents');
      if (depth.get(a) !== depth.get(b)) out.add('spouses from different generations');
    }
    if (m.status === 'ended') out.add('ended marriage');
    if (m.manualChildOrder) out.add('hand-set child order');
    if (m.childIds.length >= 8) out.add('8 or more children');
    if (m.childIds.length === 0) out.add('marriage with no children');
  }
  for (const p of data.people) {
    if ((count.get(p.id) ?? 0) > 1) out.add(parentsOf.has(p.id) ? 'remarriage' : 'outsider married into two lines');
    if (p.unknown) out.add('placeholder spouse');
    if (!p.gender && !p.unknown) out.add('no gender');
    if (p.manualGeneration != null) out.add('hand-set generation');
    if (!count.has(p.id) && !parentsOf.has(p.id) && data.people.length > 1) out.add('person on their own');
  }
  if (roots > 1) out.add('several founding families');
  // Who each person descends from, for the cousin and intermarriage labels.
  const ancestorsOf = (id: ID, seen = new Set<ID>()): Set<ID> => {
    for (const p of parentsOf.get(id) ?? []) if (!seen.has(p)) (seen.add(p), ancestorsOf(p, seen));
    return seen;
  };
  const foundersOf = (id: ID) => [...ancestorsOf(id), id].filter((x) => !parentsOf.has(x));
  for (const m of data.marriages) {
    const [a, b] = m.spouseIds;
    if (m.status === 'ended' && m.childIds.length > 0) out.add('ended marriage with children');
    if (parentsOf.has(a) && parentsOf.has(b)) {
      const ancestorsA = ancestorsOf(a);
      if ([...ancestorsOf(b)].some((x) => ancestorsA.has(x))) out.add('cousin marriage');
      const foundersA = new Set(foundersOf(a));
      if (!foundersOf(b).some((f) => foundersA.has(f))) out.add('founding families married into each other');
    }
  }
  for (const p of data.people) {
    if (p.manualGeneration != null && parentsOf.has(p.id) && p.manualGeneration > (depth.get(p.id) ?? 0)) out.add('child moved down by hand');
  }
  if (data.people.length === 1) out.add('single person');
  if (data.people.length >= 150) out.add('150 or more people');
  if (data.people.length >= 450) out.add('450 or more people');
  if (Math.max(...depth.values()) >= 9) out.add('10 or more generations');
  if (Math.max(...depth.values()) <= 4 && data.people.length >= 300) out.add('5 generations, 300 or more people');
  if (data.people.some((p) => LONG_FIRST.includes(p.name) || LONG_SURNAMES.includes(p.surname ?? ''))) out.add('very long name');
  return [...out].sort();
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT, f));
for (let i = 0; i < COUNT; i++) {
  const family = makeFamily(i);
  fs.writeFileSync(path.join(OUT, `${String(i + 1).padStart(3, '0')}.json`), JSON.stringify(family) + '\n');
}
console.log(`wrote ${COUNT} families to test-families/`);
