import type { FamilyData } from '../src/types';
import { familyProblems, personTreeProblems } from './lib/familyRules';
import { normalizeFamilyData } from '../src/storage/migrate';

/**
 * Runs every layout rule (scripts/lib/familyRules.ts) over the owner's real
 * family trees, kept in local/ (git-ignored personal data, see AGENTS.md),
 * so they only exist on the owner's machine:
 * - local/myFamily.ts (exports `myFamily`), and
 * - every app export file in local/ (*.json, the app's "Export" format),
 *   each tree in it.
 * Anywhere else this script just says so and exits.
 */
async function main() {
  const fs = require('fs') as { readdirSync(p: string): string[]; readFileSync(p: string, e: string): string; existsSync(p: string): boolean };
  const trees: { label: string; data: FamilyData }[] = [];

  // Not a literal path, so typechecking doesn't fail where the file is absent.
  const file = '../local/myFamily';
  try {
    const { myFamily } = (await import(file)) as { myFamily: FamilyData };
    trees.push({ label: 'local/myFamily.ts', data: myFamily });
  } catch {
    // No such file here.
  }
  if (fs.existsSync('local')) {
    for (const f of fs.readdirSync('local').filter((x) => x.endsWith('.json'))) {
      try {
        const raw = JSON.parse(fs.readFileSync(`local/${f}`, 'utf8'));
        for (const tree of raw.trees ?? []) {
          trees.push({ label: `local/${f} (${tree.name})`, data: normalizeFamilyData({ people: tree.people, marriages: tree.marriages }) });
        }
      } catch (err) {
        console.error(`FAIL: local/${f} isn't a readable export file: ${String(err)}`);
        process.exitCode = 1;
      }
    }
  }
  if (trees.length === 0) {
    console.log('skip: no private family trees in local/ on this machine');
    return;
  }

  const testWords = (data: FamilyData) =>
    new Set(data.people.flatMap((p) => [p.id, p.name, p.surname, p.birthPlace, p.gravePlace, p.notes].filter((x): x is string => !!x)).concat(data.marriages.map((m) => m.id)));
  const testFamilies = fs.readdirSync('test-families').filter((x) => x.endsWith('.json'));

  for (const { label, data } of trees) {
    // The whole tree, and the one-person view of every person in it.
    const problems = [...familyProblems(data), ...data.people.flatMap((p) => personTreeProblems(data, p.id))];

    // The test families (test-families/, committed) must share nothing with
    // a private tree: no name, surname, place, note or id.
    const mine = testWords(data);
    for (const f of testFamilies) {
      const shared = [...testWords(JSON.parse(fs.readFileSync(`test-families/${f}`, 'utf8')).data)].filter((w) => mine.has(w));
      if (shared.length > 0) problems.push(`test-families/${f} shares something with the private tree (${shared.length} values)`);
    }
    for (const p of problems) console.error(`FAIL: [${label}] ${p}`);
    console.log(problems.length > 0 ? `${label}: problems found` : `ok  : ${label} (${data.people.length} people) follows every layout rule and shares nothing with test-families/`);
    if (problems.length > 0) process.exitCode = 1;
  }
}

main();
