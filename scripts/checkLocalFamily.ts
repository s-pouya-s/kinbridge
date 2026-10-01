import type { FamilyData } from '../src/types';
import { familyProblems, personTreeProblems } from './lib/familyRules';

/**
 * Runs every layout rule (scripts/lib/familyRules.ts) over a real family
 * tree kept in local/myFamily.ts, which is git-ignored personal data (see
 * AGENTS.md) and so only exists on the owner's machine. Anywhere else this
 * script just says so and exits.
 */
async function main() {
  // Not a literal path, so typechecking doesn't fail where the file is absent.
  const file = '../local/myFamily';
  let myFamily: FamilyData;
  try {
    ({ myFamily } = (await import(file)) as { myFamily: FamilyData });
  } catch {
    console.log('skip: no local/myFamily.ts on this machine');
    return;
  }
  // The whole tree, and the one-person view of every person in it.
  const problems = [...familyProblems(myFamily), ...myFamily.people.flatMap((p) => personTreeProblems(myFamily, p.id))];

  // The test families (test-families/, committed) must share nothing with
  // this private tree: no name, surname, place, note or id.
  const fs = require('fs') as { readdirSync(p: string): string[]; readFileSync(p: string, e: string): string };
  const words = (data: FamilyData) =>
    new Set(data.people.flatMap((p) => [p.id, p.name, p.surname, p.birthPlace, p.gravePlace, p.notes].filter((x): x is string => !!x)).concat(data.marriages.map((m) => m.id)));
  const mine = words(myFamily);
  for (const f of fs.readdirSync('test-families').filter((x) => x.endsWith('.json'))) {
    const shared = [...words(JSON.parse(fs.readFileSync(`test-families/${f}`, 'utf8')).data)].filter((w) => mine.has(w));
    if (shared.length > 0) problems.push(`test-families/${f} shares something with the private tree (${shared.length} values)`);
  }
  for (const p of problems) console.error('FAIL:', p);
  console.log(problems.length > 0 ? 'local family: problems found' : `ok  : local family (${myFamily.people.length} people) follows every layout rule and shares nothing with test-families/`);
  if (problems.length > 0) process.exitCode = 1;
}

main();
