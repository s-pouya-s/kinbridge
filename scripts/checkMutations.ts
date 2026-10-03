import { richFamily } from './fixtures/richFamily';
import {
  canBeChildOf,
  removeChildFromMarriage,
  toggleBornTogether,
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
import { groupsOf, orderedChildIds } from '../src/layout/siblings';
import { orderAfterDrag, topsOf } from '../src/utils/dragOrder';

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
  // Kian already exists (Dara's first husband, no parents of his own, and
  // not an ancestor of Yusuf or Sana) — link him as a child of Yusuf &
  // Sana's marriage, which starts with just Tara. (Someone who already has
  // parents, like Omid, is refused: see canBeChildOf below.)
  const data = addExistingChild(richFamily, 'm-yusuf-sana', 'kian');
  assert(data.people.length === before, 'no new person is created — the child already existed');
  const marriage = data.marriages.find((m) => m.id === 'm-yusuf-sana')!;
  assert(marriage.childIds.includes('kian') && marriage.childIds.includes('tara'), "Kian is added alongside Tara, who's still there");

  // Linking someone already a child of that marriage a second time is a no-op.
  const again = addExistingChild(data, 'm-yusuf-sana', 'kian');
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

// Adding an existing person as a child never makes anyone their own
// ancestor (a loop the layout can't draw: whole branches vanished) and
// never gives someone a second set of parents.
{
  const loop: FamilyData = {
    people: ['gp', 'gm', 'kid', 'kidWife', 'grandkid', 'gkWife'].map((id) => ({ id, name: id })),
    marriages: [
      { id: 'm-old', spouseIds: ['gp', 'gm'], status: 'current', childIds: ['kid'] },
      { id: 'm-kid', spouseIds: ['kid', 'kidWife'], status: 'current', childIds: ['grandkid'] },
      { id: 'm-gk', spouseIds: ['grandkid', 'gkWife'], status: 'current', childIds: [] },
    ],
  };
  assert(!canBeChildOf(loop, 'm-gk', 'gp'), 'a grandfather can\'t become his own grandson\'s child');
  assert(addExistingChild(loop, 'm-gk', 'gp') === loop, 'and addExistingChild refuses it, changing nothing');
  assert(!canBeChildOf(loop, 'm-gk', 'kid'), 'nobody gets a second set of parents');
  assert(canBeChildOf(loop, 'm-gk', 'gkWife') === false, "a spouse can't be their own marriage's child");
  assert(canBeChildOf(loop, 'm-old', 'kidWife'), 'someone unrelated with no parents can still be added as a child');
}

// Children born together: link neighbors into a group of any size, unlink
// to split it, and the groups stay valid as children come and go.
{
  const kids = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'];
  let d: FamilyData = {
    people: ['mom', 'dad', ...kids].map((id, i) => ({ id, name: id, born: i < 2 ? undefined : `1990-01-0${i}` })),
    marriages: [{ id: 'm', spouseIds: ['mom', 'dad'], status: 'current', childIds: kids }],
  };
  const byId = () => new Map(d.people.map((p) => [p.id, p]));
  const groups = () => groupsOf(d.marriages[0]).map((g) => g.join(',')).sort();
  d = toggleBornTogether(d, 'm', 'k1', 'k2', byId());
  assert(groups().join('|') === 'k1,k2', 'linking two neighbors makes twins');
  for (const [a, b] of [['k2', 'k3'], ['k3', 'k4'], ['k4', 'k5']]) d = toggleBornTogether(d, 'm', a, b, byId());
  assert(groups().join('|') === 'k1,k2,k3,k4,k5', `linking on down the list grows the group to five (got ${groups().join('|')})`);
  d = toggleBornTogether(d, 'm', 'k2', 'k3', byId());
  assert(groups().join('|') === 'k1,k2|k3,k4,k5', `unlinking in the middle splits it into twins and triplets (got ${groups().join('|')})`);
  d = toggleBornTogether(d, 'm', 'k1', 'k2', byId());
  assert(groups().join('|') === 'k3,k4,k5', 'unlinking twins leaves no group of one');
  d = removeChildFromMarriage(d, 'm', 'k4');
  assert(groups().join('|') === 'k3,k5', 'removing a triplet leaves the other two as twins');
  d = deletePerson(d, 'k5');
  assert(groups().length === 0 && !('multipleBirths' in d.marriages[0]), 'deleting one of twins leaves no group');
}
{
  // Born together but with different dates on record: still side by side.
  const d: FamilyData = {
    people: [
      { id: 'a', name: 'a', born: '1990-01-01' },
      { id: 'b', name: 'b', born: '1992-01-01' },
      { id: 'c', name: 'c', born: '1994-01-01' },
      { id: 'mom', name: 'mom' },
      { id: 'dad', name: 'dad' },
    ],
    marriages: [{ id: 'm', spouseIds: ['mom', 'dad'], status: 'current', childIds: ['c', 'b', 'a'], multipleBirths: [['a', 'c']] }],
  };
  const order = orderedChildIds(d.marriages[0], new Map(d.people.map((p) => [p.id, p])));
  assert(order.join() === 'a,c,b', `children born together sit side by side in sibling order (got ${order.join()})`);
}

// Dragging in the children list moves whole blocks: a single child, or a
// whole group born together (here 'tw', two rows tall). Nothing can land
// inside a group.
{
  const STEP = 56;
  const heights = { a: STEP, tw: 2 * STEP, b: STEP };
  const order = ['a', 'tw', 'b'];
  assert(JSON.stringify(topsOf(order, heights)) === JSON.stringify({ a: 0, tw: STEP, b: 3 * STEP }), 'blocks sit one after another, the group two rows tall');
  // Drag b up to between the twins' rows (its middle at the twins' middle):
  // it lands before or after the whole group, never inside it.
  const between = orderAfterDrag(order, heights, 'b', 2 * STEP - STEP / 2);
  assert(between.join() === 'a,tw,b' || between.join() === 'a,b,tw', `a child dragged onto twins lands beside the group, not inside it (got ${between.join()})`);
  assert(orderAfterDrag(order, heights, 'b', 0).join() === 'b,a,tw', 'a child dragged to the top lands first');
  assert(orderAfterDrag(order, heights, 'tw', 2 * STEP).join() === 'a,b,tw', 'the twins dragged down move as one, past the next child');
  assert(orderAfterDrag(order, heights, 'tw', 0).join() === 'tw,a,b', 'and dragged up, past the child above');
  assert(orderAfterDrag(order, heights, 'a', 0).join() === 'a,tw,b', 'a small drag leaves the order alone');
}

process.exit(process.exitCode ?? 0);
