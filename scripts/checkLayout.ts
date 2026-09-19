import { richFamily } from './fixtures/richFamily';
import { computeGenerations } from '../src/layout/generations';
import { computeLayout, NODE_WIDTH, COL_SPACING, ROW_SPACING, UNION_OFFSET } from '../src/layout/layout';
import type { FamilyData } from '../src/types';
import { addExistingSpouse, addSpouse, addStandalonePerson, movePersonGeneration, movePersonOneStep } from '../src/model/mutations';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok  :', msg);
  }
}

const gens = computeGenerations(richFamily);
console.log('Generations:', Object.fromEntries(gens));

assert(gens.get('elias') === 0 && gens.get('mara') === 0, 'grandparents are generation 0');
assert(gens.get('dara') === 1 && gens.get('noor') === 1, 'Dara and Noor are generation 1');
assert(gens.get('kian') === 1 && gens.get('wren') === 1, "Dara's spouses stay level with her");
assert(gens.get('unknown-1') === 1, "Noor's unknown spouse stays level with her");
assert(gens.get('layla') === 2 && gens.get('yusuf') === 2 && gens.get('sana') === 2 && gens.get('omid') === 2, 'cousins are generation 2');
assert(gens.get('tara') === 3, "Yusuf and Sana's daughter is generation 3");

function checkNoOverlap(label: string, priorityPair?: [string, string]) {
  const layout = computeLayout(richFamily, priorityPair);
  const byRow = new Map<number, { id: string; x: number }[]>();
  layout.positions.forEach((p, id) => {
    const arr = byRow.get(p.y) ?? [];
    arr.push({ id, x: p.x });
    byRow.set(p.y, arr);
  });
  let overlap = false;
  byRow.forEach((row) => {
    const sorted = row.slice().sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x - sorted[i - 1].x < NODE_WIDTH) {
        overlap = true;
        console.error(`  card overlap in ${label}: ${sorted[i - 1].id} and ${sorted[i].id} are ${sorted[i].x - sorted[i - 1].x}px apart`);
      }
    }
  });
  assert(!overlap, `no card overlap (${label})`);

  const markerKeys = new Set<string>();
  let markerOverlap = false;
  layout.unions.forEach((u) => {
    const key = `${Math.round(u.markerX)}|${Math.round(u.markerY)}`;
    if (markerKeys.has(key)) {
      markerOverlap = true;
      console.error(`  union marker overlap in ${label} at ${key} (${u.marriage.id})`);
    }
    markerKeys.add(key);
  });
  assert(!markerOverlap, `no union-marker overlap (${label})`);

  return layout;
}

checkNoOverlap('default layout');
checkNoOverlap('focused on Yusuf', ['yusuf', 'sana']);
checkNoOverlap('focused on Layla', ['layla', 'omid']);
checkNoOverlap('focused on Omid', ['omid', 'layla']);
checkNoOverlap('focused on Dara (no current-marriage adjacency needed, ended one)', ['dara', 'kian']);

const focusedOnLayla = computeLayout(richFamily, ['layla', 'omid']);
const laylaX = focusedOnLayla.positions.get('layla')!.x;
const omidX = focusedOnLayla.positions.get('omid')!.x;
assert(Math.abs(laylaX - omidX) === COL_SPACING, 'tapping Layla pulls Omid to be exactly adjacent to her');

const defaultLayout = computeLayout(richFamily);
const yusufX = defaultLayout.positions.get('yusuf')!.x;
const sanaX = defaultLayout.positions.get('sana')!.x;
assert(Math.abs(yusufX - sanaX) === COL_SPACING, 'Yusuf and Sana already land adjacent without any tap');

// Dara has two same-generation marriages (Kian 1978, then Wren 1984) — both need
// to be adjacent to her *simultaneously*. A naive pairwise "pull together" pass
// satisfies the second by breaking the first; this was a real regression.
{
  const kianX = defaultLayout.positions.get('kian')!.x;
  const daraX = defaultLayout.positions.get('dara')!.x;
  const wrenX = defaultLayout.positions.get('wren')!.x;
  assert(Math.abs(kianX - daraX) === COL_SPACING, "Kian (Dara's 1978 marriage) is adjacent to Dara");
  assert(Math.abs(wrenX - daraX) === COL_SPACING, "Wren (Dara's 1984 marriage) is also adjacent to Dara, at the same time");
  assert(kianX < daraX && daraX < wrenX, 'earlier marriage (Kian) sits canonically left of the later one (Wren) — visual right once RTL-mirrored');
}

// Rows are deliberately *not* centered or edge-aligned relative to each
// other — a person's x is just their own cell number (see computeLayout's
// docstring). Every row here is still fully automatic, so every row's own
// first person sits at cell 0, and with nobody anywhere manually positioned
// negative, the single whole-tree normalizing shift is zero — so every
// row's first person lands at exactly the same x, regardless of how many
// people are in that row.
{
  const layout = computeLayout(richFamily);
  assert(layout.positions.get('elias')!.x === 0, "generation 0's first person (Elias) sits at cell 0");
  assert(layout.positions.get('kian')!.x === 0, "generation 1's first person (Kian) sits at cell 0 too — not centered under the wider row");
  assert(layout.positions.get('layla')!.x === 0, "generation 2's first person (Layla) sits at cell 0 too");
  assert(layout.positions.get('tara')!.x === 0, 'and Tara, alone in generation 3, sits at cell 0 as well — no row is shifted to balance against another');
}

// A marriage's bar can end up spanning over a third card sitting between the
// two spouses — e.g. after a manual reorder, or a person with two marriages
// that can each only be adjacent to one spouse at a time. Two such
// overlapping bars in the same row must land on visibly different lines
// (lanes), entirely automatically — never something the user has to fix by
// hand, since a marriage's ⊕ isn't user-movable at all.
{
  let data: FamilyData = { people: [{ id: 'p', name: 'P', gender: 'male' }], marriages: [] };
  const first = addSpouse(data, 'p');
  data = first.data;
  const second = addSpouse(data, 'p');
  data = second.data;
  // By default P sits adjacent to both spouses at once (the same clustering
  // that keeps a person adjacent to more than one marriage simultaneously —
  // see the Dara/Kian/Wren case above). Swap P one step "earlier" so it
  // lands at one edge of the row instead, with one spouse now sandwiched
  // between P and the other one. Which spouse ends up "near" vs "far" isn't
  // determined ahead of time, so read it back from the resulting layout
  // rather than assuming.
  data = movePersonOneStep(data, 'p', 'earlier');

  const layout = computeLayout(data);
  const pX = layout.positions.get('p')!.x;
  const [nearId, farId] = [first.person.id, second.person.id].sort(
    (a, b) => layout.positions.get(a)!.x - layout.positions.get(b)!.x
  );
  assert(pX < layout.positions.get(nearId)!.x && layout.positions.get(nearId)!.x < layout.positions.get(farId)!.x, 'setup: P sits at the edge, with one spouse sandwiched between P and the other');

  const nearMarriageId = [first, second].find((s) => s.person.id === nearId)!.marriage.id;
  const farMarriageId = [first, second].find((s) => s.person.id === farId)!.marriage.id;
  const uNear = layout.unions.find((u) => u.marriage.id === nearMarriageId)!;
  const uFar = layout.unions.find((u) => u.marriage.id === farMarriageId)!;

  const rowY = layout.positions.get('p')!.y;
  assert(uNear.barY !== uFar.barY, "two marriages whose bars overlap in x-range land on different lanes (y), never the same line");
  assert(uNear.barY === rowY + UNION_OFFSET, 'the non-overlapping (adjacent) marriage keeps the normal row + UNION_OFFSET height — lane 0');
  assert(uFar.barY > rowY + UNION_OFFSET, "the marriage whose bar spans over the sandwiched spouse is stacked into a lower lane, not overlapping the other one");
  // Markers only ever move sideways — never vertically off their own bar.
  assert(uNear.markerY === uNear.barY && uFar.markerY === uFar.barY, 'both markers sit exactly on their own bar\'s line — no marker is ever nudged up or down');

  // The far marriage's own span is [P, far-spouse], with the near-spouse
  // sandwiched exactly at its midpoint — so beyond its lane, its marker also
  // needs the separate card-collision nudge (see computeLayout) to avoid
  // landing squarely on the near-spouse's own card.
  const rawFarMid = (pX + layout.positions.get(farId)!.x) / 2;
  assert(Math.round(rawFarMid) === layout.positions.get(nearId)!.x, 'setup: the far marriage\'s un-nudged midpoint would land exactly on the near spouse\'s card');
  assert(uFar.markerX !== rawFarMid, "the far marriage's marker slides sideways away from its own un-nudged midpoint to clear that card");
}

// Moving one card must never move anyone else — the whole point of dropping
// row centering. Pressing ‹ on Layla (edge of her row, so this opens a gap
// rather than swapping) should shift only Layla; every other person in the
// tree, in every generation, keeps the exact same position they had before.
{
  const before = computeLayout(richFamily);
  const gapped = movePersonOneStep(richFamily, 'layla', 'earlier');
  const after = computeLayout(gapped);

  assert(after.positions.get('layla')!.x !== before.positions.get('layla')!.x, 'sanity check: Layla herself did actually move');

  let othersUnchanged = true;
  richFamily.people
    .filter((p) => p.id !== 'layla')
    .forEach((p) => {
      const b = before.positions.get(p.id);
      const a = after.positions.get(p.id);
      if (!b || !a || b.x !== a.x || b.y !== a.y) {
        othersUnchanged = false;
        console.error(`  ${p.id} moved from (${b?.x},${b?.y}) to (${a?.x},${a?.y}) even though only Layla was moved`);
      }
    });
  assert(othersUnchanged, 'every other person in the tree — same row or a different generation entirely — stays exactly where they were');
}

// A swap (both ends occupied) moves exactly the two people who swap, and nobody else.
{
  const before = computeLayout(richFamily);
  const swapped = movePersonOneStep(richFamily, 'yusuf', 'earlier'); // swaps with Omid
  const after = computeLayout(swapped);

  assert(after.positions.get('yusuf')!.x === before.positions.get('omid')!.x, "Yusuf lands exactly where Omid was");
  assert(after.positions.get('omid')!.x === before.positions.get('yusuf')!.x, "and Omid lands exactly where Yusuf was — a true swap");

  let othersUnchanged = true;
  richFamily.people
    .filter((p) => p.id !== 'yusuf' && p.id !== 'omid')
    .forEach((p) => {
      const b = before.positions.get(p.id);
      const a = after.positions.get(p.id);
      if (!b || !a || b.x !== a.x || b.y !== a.y) othersUnchanged = false;
    });
  assert(othersUnchanged, 'nobody outside the swapped pair moves at all');
}

// A marriage between a blood ancestor and their own blood descendant (e.g. a
// cousin-marriage chain looping back on itself) must never make generations
// run away. Elias (generation 0) is Tara's great-great-grandfather (via
// Dara/Kian/Layla/Omid and Dara/Wren/Yusuf/Sana); marrying them directly
// used to force-level their generations, which cascaded back through the
// very descent chain connecting them and grew without bound every
// relaxation pass — this was a real reported bug (the whole tree went blank
// because generation numbers exploded into the hundreds).
{
  const married = addExistingSpouse(richFamily, 'elias', 'tara').data;
  const gens = computeGenerations(married);
  const maxGen = Math.max(...gens.values());
  assert(maxGen <= 10, `generations stay bounded after a cross-generation marriage, not runaway -> max was ${maxGen}`);
  assert(gens.get('elias') === 0, "Elias keeps his own blood generation (0) — not forced to match Tara's");
  assert(gens.get('tara') === 3, "Tara keeps her own blood generation (3) — not forced to match Elias's");

  // Manually moving Elias's row afterward (the other half of the original
  // report) must still behave normally — move his own blood line down by
  // exactly one row, not compound into another runaway.
  const moved = movePersonGeneration(married, 'elias', 'down');
  const gensAfterMove = computeGenerations(moved);
  const maxGenAfterMove = Math.max(...gensAfterMove.values());
  assert(maxGenAfterMove <= 10, `moving Elias's generation afterward still stays bounded -> max was ${maxGenAfterMove}`);
  assert(gensAfterMove.get('elias') === 1, "Elias moves down exactly one row, from 0 to 1");
  assert(gensAfterMove.get('mara') === 1, "his wife Mara (properly leveled, not an ancestor/descendant pair) follows him down");
  // Tara *does* shift too — but via her real blood parents (Yusuf & Sana,
  // descending from Elias through Dara), not through the skip-leveled
  // marriage back to Elias. That chain cascading by exactly one row, same as
  // everyone else in it, is correct — it's the runaway (max was in the
  // hundreds) that was the bug, not blood descent moving together.
  assert(gensAfterMove.get('tara') === 4, "Tara cascades down exactly one row too, via her real parents' chain");
}

// Same cross-generation marriage (Elias, generation 0, married to Tara,
// generation 3) — a real reported bug: the marker/bar used to sit at
// whichever spouse happened to be spouseIds[0]'s row, so it could land
// floating above the *younger* spouse instead of hanging below them. It
// must always sit under the lower (later-generation) spouse's row.
{
  const { data: married, marriage } = addExistingSpouse(richFamily, 'elias', 'tara');
  const gens = computeGenerations(married);
  const taraGen = gens.get('tara')!;
  const eliasGen = gens.get('elias')!;
  assert(taraGen > eliasGen, 'setup: Tara is in a later generation than Elias');

  const layout = computeLayout(married);
  const union = layout.unions.find((u) => u.marriage.id === marriage.id)!;
  assert(union.markerY > layout.positions.get('elias')!.y, 'the marker sits below Elias, not floating above him at his own (elder) row');
  assert(union.markerY === taraGen * ROW_SPACING + UNION_OFFSET, 'the marker sits under the lower-generation spouse (Tara), not the elder one (Elias)');
}

// Moving a card's generation (the ▲▼ arrows) into a row that already has
// manually-positioned cards (from a prior ‹ › press) must never land it
// exactly on top of one of them — a real reported bug. Without an explicit
// cell of its own, the newcomer fell back to its array index in that row's
// automatic construction order, which has nothing to do with manualOrder's
// cell-number space and could coincide with an existing one.
{
  let data = movePersonOneStep(richFamily, 'layla', 'earlier'); // gives generation 2 a manual cell (Layla's)
  const { data: withNewPerson, person } = addStandalonePerson(data);
  data = withNewPerson;
  data = movePersonGeneration(data, person.id, 'down'); // gen 0 -> 1
  data = movePersonGeneration(data, person.id, 'down'); // gen 1 -> 2, landing in the now-manual row

  const gens = computeGenerations(data);
  assert(gens.get(person.id) === gens.get('layla'), 'setup: the new person landed in the same (now-manual) generation as Layla');

  const layout = computeLayout(data);
  const rowIds = ['layla', 'omid', 'yusuf', 'sana', person.id];
  const xs = rowIds.map((id) => layout.positions.get(id)!.x);
  assert(new Set(xs).size === rowIds.length, `every card in that row lands on a distinct x -> got ${JSON.stringify(xs)}`);
}

// A real reported case: in a big row, one marriage spans from the far left
// to the far right (e.g. two cousins on opposite ends of a wide sibling
// group marrying). Its bar has to cross over every card in between —
// including two other, unrelated, perfectly-adjacent marriages — and
// without lane separation all three bars would render on the exact same
// line, an unreadable tangle. The two short adjacent marriages don't
// overlap *each other*, so they're free to share a lane; only the
// far-spanning one needs a lane of its own.
{
  const wideFamily: FamilyData = {
    people: [
      { id: 'a', name: 'A', manualOrder: 0 },
      { id: 'b', name: 'B', manualOrder: 1 },
      { id: 'c', name: 'C', manualOrder: 2 },
      { id: 'd', name: 'D', manualOrder: 3 },
      { id: 'e', name: 'E', manualOrder: 4 },
    ],
    marriages: [
      { id: 'm-ab', spouseIds: ['a', 'b'], status: 'current', childIds: [] }, // adjacent, span [0,1]
      { id: 'm-cd', spouseIds: ['c', 'd'], status: 'current', childIds: [] }, // adjacent, span [2,3]
      { id: 'm-ae', spouseIds: ['a', 'e'], status: 'current', childIds: [] }, // far left to far right, span [0,4]
    ],
  };

  const layout = computeLayout(wideFamily);
  const byId = new Map(layout.unions.map((u) => [u.marriage.id, u]));
  const uAB = byId.get('m-ab')!;
  const uCD = byId.get('m-cd')!;
  const uAE = byId.get('m-ae')!;

  assert(uAB.barY === uCD.barY, "the two short, non-overlapping marriages (A-B and C-D) are free to share a lane");
  assert(uAE.barY !== uAB.barY, "the far-spanning marriage (A-E), which crosses over both of them, gets its own lane instead");
  assert(new Set(layout.unions.map((u) => u.barY)).size === 2, 'exactly two lanes are used in total — not a separate one per marriage');
}

// A minimal, standalone case of a ⊕ landing on an unrelated card: a single
// marriage (no lane conflict at all) spanning an even number of columns,
// with a third, unrelated person sitting exactly at its midpoint.
{
  const sandwichFamily: FamilyData = {
    people: [
      { id: 'a', name: 'A', manualOrder: 0 },
      { id: 'b', name: 'B', manualOrder: 1 }, // unrelated — just sitting between A and C
      { id: 'c', name: 'C', manualOrder: 2 },
    ],
    marriages: [{ id: 'm-ac', spouseIds: ['a', 'c'], status: 'current', childIds: [] }],
  };
  const rawMid = (0 + 2 * COL_SPACING) / 2; // A at cell 0, C at cell 2 — un-nudged midpoint is cell 1, exactly B's cell
  const bX = COL_SPACING; // B at cell 1
  assert(rawMid === bX, "setup: the marriage's un-nudged midpoint lands exactly on B's card");

  const layout = computeLayout(sandwichFamily);
  const u = layout.unions[0];
  assert(u.markerX !== rawMid, 'the marker slides sideways away from B to avoid sitting on its card');
  assert(u.markerX === rawMid + COL_SPACING / 2, "specifically, it lands exactly half a cell over — the deterministic half-cell rule, not just 'somewhere else'");
  assert(u.markerY === u.barY, 'and never moves off its own bar\'s line to do it — only sideways, never up or down');
  assert(u.barY === layout.positions.get('a')!.y + UNION_OFFSET, 'the bar itself (connecting A and C) is untouched — only the marker moves');
}

// The general guarantee behind all of the above: a ⊕ marker's cell is
// always a half-cell (never a whole one), for every marriage in the whole
// fixture — regardless of how far apart the spouses are, or whether their
// span is odd or even — so it can never coincide with any card, by
// construction, with no case-by-case collision-checking involved at all.
{
  const layout = computeLayout(richFamily);
  const allHalfCells = layout.unions.every((u) => {
    const cell = u.markerX / COL_SPACING;
    return Math.abs(cell - Math.floor(cell) - 0.5) < 1e-9;
  });
  assert(allHalfCells, 'every ⊕ marker in the fixture sits on a half-cell, never a whole one');
}

// When there's a genuine choice of which half-cell to use (the spouses'
// cells sum to an even number, so the true midpoint would fall on a whole
// one), the side closer to the marriage's own children wins — keeping the
// drop-lines down to them short and direct instead of picking an arbitrary
// side that makes them awkwardly cross back the other way.
{
  // A and B span cells [0, 2] — an even sum, so the marker must choose
  // between cell 0.5 (earlier) and cell 1.5 (later); with no children to
  // weigh in, it defaults to the later side.
  const noChildren: FamilyData = {
    people: [
      { id: 'a', name: 'A', manualOrder: 0 },
      { id: 'b', name: 'B', manualOrder: 2 },
    ],
    marriages: [{ id: 'm-ab', spouseIds: ['a', 'b'], status: 'current', childIds: [] }],
  };
  assert(computeLayout(noChildren).unions[0].markerX / COL_SPACING === 1.5, 'with no children to weigh in, the ambiguous case defaults to the later half-cell');

  const childToTheEarlySide: FamilyData = {
    people: [
      { id: 'a', name: 'A', manualOrder: 0 },
      { id: 'b', name: 'B', manualOrder: 2 },
      { id: 'kid', name: 'Kid', manualOrder: -3 }, // generation 1, well to the "earlier" side
    ],
    marriages: [{ id: 'm-ab', spouseIds: ['a', 'b'], status: 'current', childIds: ['kid'] }],
  };
  assert(computeLayout(childToTheEarlySide).unions[0].markerX / COL_SPACING === 0.5, "with their child off to the earlier side, the marker picks the earlier half-cell instead — closer to the child");

  const childToTheLateSide: FamilyData = {
    people: [
      { id: 'a', name: 'A', manualOrder: 0 },
      { id: 'b', name: 'B', manualOrder: 2 },
      { id: 'kid', name: 'Kid', manualOrder: 5 }, // generation 1, well to the "later" side
    ],
    marriages: [{ id: 'm-ab', spouseIds: ['a', 'b'], status: 'current', childIds: ['kid'] }],
  };
  assert(computeLayout(childToTheLateSide).unions[0].markerX / COL_SPACING === 1.5, 'and with the child off to the later side, it correctly keeps the later half-cell');
}

// A real reported case: a wide-spanning marriage (many cards between the two
// spouses) whose children sit well off to one side of the bar's own center.
// Picking only between the two half-cells nearest the center (the previous,
// too-narrow version of this fix) still leaves the marker far from its
// children and crossing a pile of unrelated lines on the way down to them.
// It has to search *every* half-cell along the whole span and land on
// whichever is genuinely closest to the children, however far that is from
// the center.
{
  const wideSpanFamily: FamilyData = {
    people: [
      { id: 'a', name: 'A', manualOrder: 0 },
      { id: 'b', name: 'B', manualOrder: 1 },
      { id: 'c', name: 'C', manualOrder: 2 },
      { id: 'd', name: 'D', manualOrder: 3 },
      { id: 'e', name: 'E', manualOrder: 4 },
      { id: 'f', name: 'F', manualOrder: 5 }, // A's spouse — span [0,5], center would be cell 2.5
      { id: 'kid1', name: 'Kid1', manualOrder: 0 }, // generation 1, right under A's end of the bar
      { id: 'kid2', name: 'Kid2', manualOrder: 1 },
    ],
    marriages: [{ id: 'm-af', spouseIds: ['a', 'f'], status: 'current', childIds: ['kid1', 'kid2'] }],
  };
  const layout = computeLayout(wideSpanFamily);
  const markerCell = layout.unions[0].markerX / COL_SPACING;
  assert(markerCell === 0.5, `the marker lands next to the children (cell 0.5), not merely the two cells nearest the bar's true center (2.5) -> got ${markerCell}`);
}

// Another real reported case: two *different* marriages, in different lanes
// (their bars overlap, so they don't share a line), whose "closest to
// children" picks would otherwise be the exact same half-cell — landing
// both markers at the same x, just a lane apart in y, reading as one
// doubled-up marker instead of two distinct ones. The narrower-span
// marriage (fewer options of its own) gets first claim on the ideal cell;
// the wider one has to settle for its next-best.
{
  const clashFamily: FamilyData = {
    people: [
      { id: 'p0', name: 'P0', manualOrder: 0 },
      { id: 'p1', name: 'P1', manualOrder: 1 },
      { id: 'p3', name: 'P3', manualOrder: 3 },
      { id: 'p4', name: 'P4', manualOrder: 4 },
      { id: 'kidA', name: 'KidA', manualOrder: 1 },
      { id: 'kidB', name: 'KidB', manualOrder: 2 },
      { id: 'kidC', name: 'KidC', manualOrder: 1 },
    ],
    marriages: [
      // Wide: span [0,4], children average to cell 1.5 — its own single best pick.
      { id: 'm-wide', spouseIds: ['p0', 'p4'], status: 'current', childIds: ['kidA', 'kidB'] },
      // Narrow: span [1,3] (nested inside the wide one — different lanes), child at cell 1 -> best pick is also 1.5.
      { id: 'm-narrow', spouseIds: ['p1', 'p3'], status: 'current', childIds: ['kidC'] },
    ],
  };
  const layout = computeLayout(clashFamily);
  const byId = new Map(layout.unions.map((u) => [u.marriage.id, u]));
  const wide = byId.get('m-wide')!;
  const narrow = byId.get('m-narrow')!;

  assert(wide.barY !== narrow.barY, 'setup: the two marriages are on different lanes (their spans overlap)');
  assert(narrow.markerX === 1.5 * COL_SPACING, 'the narrower marriage claims its own single best cell (1.5)');
  assert(wide.markerX !== narrow.markerX, "the wider marriage, whose ideal pick was already taken, lands on a genuinely different x — never the same spot, even a lane apart");
}

process.exit(process.exitCode ?? 0);
