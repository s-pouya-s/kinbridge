import { richFamily } from './fixtures/richFamily';
import {
  addChild,
  addExistingChild,
  addExistingSpouse,
  addParents,
  addStandalonePerson,
  deletePerson,
  hasParents,
  movePersonGeneration,
  movePersonOneStep,
  resetRowOrder,
} from '../src/model/mutations';
import { computeGenerations } from '../src/layout/generations';
import { computeLayout, COL_SPACING } from '../src/layout/layout';
import type { FamilyData } from '../src/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok  :', msg);
  }
}

// --- addChild defaults the surname to the father's ---
{
  const { data, person } = addChild(richFamily, 'm-dara-wren'); // Dara (mother) + Wren (father, male)
  const wren = richFamily.people.find((p) => p.id === 'wren')!;
  assert(person.surname === wren.surname, `new child inherits father Wren's surname "${wren.surname}" -> got "${person.surname}"`);
  assert(data.marriages.find((m) => m.id === 'm-dara-wren')!.childIds.includes(person.id), 'new child was added to the marriage');
}

// A marriage with no male spouse (or an unknown one) leaves the surname unset rather than guessing.
{
  const { person } = addChild(richFamily, 'm-noor-unknown'); // Noor (female) + Unknown (no gender)
  assert(person.surname === undefined, `no father on record -> surname left blank, got "${person.surname}"`);
}

// --- addExistingSpouse: marry two people already in the tree, instead of always creating someone new ---
{
  const before = richFamily.marriages.length;
  const { data, marriage } = addExistingSpouse(richFamily, 'noor', 'kian'); // two existing, unrelated-to-each-other people
  assert(data.people.length === richFamily.people.length, 'no new person is created — both spouses already existed');
  assert(data.marriages.length === before + 1, 'exactly one new marriage was added');
  assert(marriage.spouseIds.includes('noor') && marriage.spouseIds.includes('kian'), 'the new marriage links the two existing people requested');
  assert(data.people.find((p) => p.id === 'noor') === richFamily.people.find((p) => p.id === 'noor'), "Noor's own record is untouched (same reference)");
}

// --- addExistingChild: link an existing person as a child of a marriage, instead of always creating someone new ---
{
  const before = richFamily.people.length;
  // Omid already exists (married to Layla) — link him as an (additional, genealogically
  // odd but structurally valid) child of Yusuf & Sana's marriage, which starts with just Tara.
  const data = addExistingChild(richFamily, 'm-yusuf-sana', 'omid');
  assert(data.people.length === before, 'no new person is created — the child already existed');
  const marriage = data.marriages.find((m) => m.id === 'm-yusuf-sana')!;
  assert(marriage.childIds.includes('omid') && marriage.childIds.includes('tara'), "Omid is added alongside Tara, who's still there");

  // Linking someone already a child of that marriage a second time is a no-op.
  const again = addExistingChild(data, 'm-yusuf-sana', 'omid');
  assert(again === data, 'linking an existing child a second time changes nothing (same reference)');
}

// --- hasParents: whether a person is already recorded as someone's child ---
{
  assert(hasParents(richFamily, 'tara') === true, 'Tara has parents on record (Yusuf & Sana)');
  assert(hasParents(richFamily, 'unknown-1') === false, "Noor's unknown spouse has no parents on record");
  assert(hasParents(richFamily, 'elias') === false, 'Elias, at the top of the tree, has no parents on record either');
}

// --- addParents: "+ New parents" — two brand-new people, married, with this person as their child from the start ---
{
  const before = richFamily.people.length;
  const beforeMarriages = richFamily.marriages.length;
  const { data, parentA, parentB, marriage } = addParents(richFamily, 'unknown-1');
  assert(data.people.length === before + 2, 'exactly two new people (the parents) are created');
  assert(data.marriages.length === beforeMarriages + 1, 'exactly one new marriage is created');
  assert(marriage.spouseIds.includes(parentA.id) && marriage.spouseIds.includes(parentB.id), 'the new marriage is between the two new parents');
  assert(marriage.childIds.includes('unknown-1'), "Noor's unknown spouse is already this marriage's child, from the outset");
  assert(hasParents(data, 'unknown-1') === true, 'hasParents now reports true for them');
  assert(hasParents(data, 'tara') === true, "and is unaffected for everyone else (Tara's own parents are untouched)");
}

// --- deletePerson cascades: removes marriages they were a spouse in, detaches them as a child elsewhere ---
{
  // Dara is a spouse in two marriages (m-kian-dara, m-dara-wren) and a child in one (m-elias-mara).
  const next = deletePerson(richFamily, 'dara');
  assert(!next.people.some((p) => p.id === 'dara'), 'Dara removed from people');
  assert(!next.marriages.some((m) => m.id === 'm-kian-dara'), "Dara's marriage to Kian is gone (can't have one spouse)");
  assert(!next.marriages.some((m) => m.id === 'm-dara-wren'), "Dara's marriage to Wren is gone (can't have one spouse)");
  const elMara = next.marriages.find((m) => m.id === 'm-elias-mara')!;
  assert(!elMara.childIds.includes('dara'), 'Dara spliced out of her parents (Elias & Mara) childIds');
  assert(elMara.childIds.includes('noor'), "her sibling Noor's link to their parents is untouched");
  // Kian, Wren, Layla, Yusuf all still exist — only relationships to Dara specifically were cut.
  ['kian', 'wren', 'layla', 'yusuf', 'noor'].forEach((id) => {
    assert(next.people.some((p) => p.id === id), `${id} still exists after Dara is deleted`);
  });
  // Layla (Dara & Kian's daughter) keeps her own marriage to Omid untouched.
  assert(next.marriages.some((m) => m.id === 'm-layla-omid'), "Layla's own marriage is unaffected");
}

function rowOf(data: FamilyData, personId: string): string[] {
  const layout = computeLayout(data);
  const y = layout.positions.get(personId)!.y;
  return Array.from(layout.positions.entries())
    .filter(([, p]) => p.y === y)
    .sort((a, b) => a[1].x - b[1].x)
    .map(([id]) => id);
}

// --- movePersonGeneration: align an unconnected second tree's root with a specific row ---
{
  let data = addStandalonePerson(richFamily).data;
  const newRoot = data.people[data.people.length - 1].id;
  assert(computeGenerations(data).get(newRoot) === 0, 'a fresh standalone person starts at generation 0');

  data = movePersonGeneration(data, newRoot, 'down');
  assert(computeGenerations(data).get(newRoot) === 1, "moving 'down' once puts them at generation 1 (Dara/Noor's row)");

  data = movePersonGeneration(data, newRoot, 'down');
  assert(computeGenerations(data).get(newRoot) === 2, "a second 'down' continues from generation 1, not back from 0");

  // Can't move above the top row.
  const atTop = movePersonGeneration(richFamily, 'elias', 'up');
  assert(computeGenerations(atTop).get('elias') === 0, "moving 'up' past generation 0 is a no-op");

  // A blood child can never end up above their own parent, even if you try.
  const tried = movePersonGeneration(richFamily, 'dara', 'up');
  assert(computeGenerations(tried).get('dara') === 1, "trying to move Dara 'up' does nothing — her parents (gen 0) still force her to gen 1");
}

// --- movePersonOneStep: a row is a strip of numbered cells; this moves a person exactly
// one cell earlier/later, swapping with whoever's there — or, if the cell is empty,
// just moving into it (which is how a row grows breathing-room cells). ---
{
  const before = rowOf(richFamily, 'yusuf');
  assert(before.join(',') === 'layla,omid,yusuf,sana', `starting order -> got ${before.join(',')}`);
  const moved = movePersonOneStep(richFamily, 'yusuf', 'earlier');
  assert(rowOf(moved, 'yusuf').join(',') === 'layla,yusuf,omid,sana', `movePersonOneStep('earlier') swaps with the immediate neighbor -> got ${rowOf(moved, 'yusuf').join(',')}`);
  // A swap is symmetric — Omid ends up exactly where Yusuf was.
  const movedLayout = computeLayout(moved);
  const baseLayout = computeLayout(richFamily);
  assert(movedLayout.positions.get('omid')!.x === baseLayout.positions.get('yusuf')!.x, "swapping moves the displaced neighbor into the mover's old spot, not just anywhere");

  // At the row edge there's no neighbor to swap with, so Layla just moves into the
  // (previously nonexistent) cell one step further out — nobody else's *cell number*
  // changes, even though the row's shared "leftmost = 0" origin shifts to match.
  const atEdge = movePersonOneStep(richFamily, 'layla', 'earlier');
  const laylaCell = atEdge.people.find((p) => p.id === 'layla')!.manualOrder;
  const omidCell = atEdge.people.find((p) => p.id === 'omid')!.manualOrder;
  assert(laylaCell === -1, `Layla (was cell 0, first in the row) moves to cell -1 -> got ${laylaCell}`);
  assert(omidCell === 1, `Omid's own cell number is untouched by Layla's move -> got ${omidCell}`);
  // The now-empty cell 0 shows up as a full extra column of space between them.
  const edgeLayout = computeLayout(atEdge);
  assert(edgeLayout.positions.get('omid')!.x - edgeLayout.positions.get('layla')!.x === COL_SPACING * 2, 'the vacated cell renders as one empty column between Layla and Omid');

  // A second press in the same direction moves Layla one cell further still (-2), not stacking onto the same spot.
  const atEdgeTwice = movePersonOneStep(atEdge, 'layla', 'earlier');
  assert(atEdgeTwice.people.find((p) => p.id === 'layla')?.manualOrder === -2, 'a second edge press continues from -1 to -2');

  // The same thing happens at the end of a row: Sana moves to one cell past everyone else.
  const afterEdge = movePersonOneStep(richFamily, 'sana', 'later');
  const sanaCell = afterEdge.people.find((p) => p.id === 'sana')!.manualOrder;
  const yusufCell = afterEdge.people.find((p) => p.id === 'yusuf')!.manualOrder;
  assert(sanaCell === (yusufCell ?? 0) + 2, "Sana (was last) opens one empty cell between herself and Yusuf, same as Layla's case mirrored");
}

// --- resetRowOrder clears any manually-set cells (drag OR arrow-opened gaps), back to automatic ---
{
  const gapped = movePersonOneStep(richFamily, 'layla', 'earlier');
  const reset = resetRowOrder(gapped, 'layla');
  const laylaAfterReset = reset.people.find((p) => p.id === 'layla')!;
  assert(laylaAfterReset.manualOrder === undefined, 'resetRowOrder clears an edge-opened manual cell number');
  const layout = computeLayout(reset);
  const baseLayout = computeLayout(richFamily);
  assert(layout.positions.get('layla')!.x === baseLayout.positions.get('layla')!.x, 'and the layout goes right back to the fully-automatic positions');
}

process.exit(process.exitCode ?? 0);
