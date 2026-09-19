import { richFamily } from './fixtures/richFamily';
import { computeParentChildLayout } from '../src/layout/parentChildLayout';
import { COL_SPACING, NODE_WIDTH, ROW_SPACING } from '../src/layout/layout';
import type { FamilyData } from '../src/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok  :', msg);
  }
}

const layout = computeParentChildLayout(richFamily);
const pos = (id: string) => layout.positions.get(id)!;

// No two cards in the same row overlap.
{
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
        console.error(`  card overlap: ${sorted[i - 1].id} and ${sorted[i].id} are ${sorted[i].x - sorted[i - 1].x}px apart`);
      }
    }
  });
  assert(!overlap, 'no card overlap anywhere in the fixture');
}

// Elias & Mara — a root couple (neither has recorded parents). Elias, as
// the anchor, is centered over their combined children (Dara, Noor); Mara
// sits close beside him — a real, previously-shipped bug had root couples
// bookend across their *entire* descendant span (which, with Dara's own
// spouses and their outsider zone folded in, could be a dozen-plus cells
// wide), leaving Mara implausibly far from Elias for no structural reason.
{
  const eliasX = pos('elias').x;
  const maraX = pos('mara').x;
  assert(eliasX !== maraX, "Elias and Mara don't land on the same cell");
  const daraX = pos('dara').x;
  const noorX = pos('noor').x;
  assert(eliasX >= Math.min(daraX, noorX) && eliasX <= Math.max(daraX, noorX), 'Elias (the anchor) sits centered over Dara and Noor');
  assert(Math.abs(eliasX - maraX) <= 2 * COL_SPACING, 'Mara sits close beside Elias, not spread across their whole descendant span');
}

// Dara has two marriages (Kian, ended; Wren, current) — both to outsiders
// with no recorded parents of their own. Dara herself is the blood anchor
// (Elias & Mara's daughter), centered over her *own* combined children
// (Layla + Yusuf); Kian and Wren are pushed into the overflow zone rather
// than bookending her, since neither has anywhere else to belong. Each
// marriage's own child should still sit closer to that specific marriage's
// marker than to the other one's.
{
  const daraX = pos('dara').x;
  const laylaX = pos('layla').x;
  const yusufX = pos('yusuf').x;
  const lo = Math.min(laylaX, yusufX);
  const hi = Math.max(laylaX, yusufX);
  assert(daraX >= lo && daraX <= hi, 'Dara sits centered over her own combined children (Layla and Yusuf), not bookended by her spouses');

  const kianDara = layout.unions.find((u) => u.marriage.id === 'm-kian-dara')!;
  const daraWren = layout.unions.find((u) => u.marriage.id === 'm-dara-wren')!;
  assert(Math.abs(kianDara.markerX - laylaX) < Math.abs(daraWren.markerX - laylaX), "Layla (Kian's child) is closer to the Kian-Dara marker than to the Dara-Wren one");
  assert(Math.abs(daraWren.markerX - yusufX) <= Math.abs(kianDara.markerX - yusufX), "Yusuf (Wren's child) is at least as close to the Dara-Wren marker as to the Kian-Dara one");
}

// Dara and Noor are siblings (Elias & Mara's children) — their whole
// subtree bands (each spanning their own children) must be contiguous,
// with no other card — least of all one of Dara's own spouses (Kian,
// Wren) or Noor's — wedged in between. This is the exact bug the
// sibling/spouse redesign fixed: spouses used to bookend into their
// partner's cluster, landing *between* two blood siblings instead of off
// to the side in an overflow zone.
{
  const daraX = pos('dara').x;
  const noorX = pos('noor').x;
  const daraY = pos('dara').y;
  const lo = Math.min(daraX, noorX);
  const hi = Math.max(daraX, noorX);
  const betweenSiblings = richFamily.people.filter((p) => p.id !== 'dara' && p.id !== 'noor' && pos(p.id).y === daraY && pos(p.id).x > lo && pos(p.id).x < hi);
  assert(betweenSiblings.length === 0, `no card is wedged between the two sibling cards (Dara, Noor) — found: ${betweenSiblings.map((p) => p.id).join(', ') || 'none'}`);
}

// Layla & Omid are a cousin marriage — both have their own recorded
// parents (Dara and Noor respectively), so neither is dragged into the
// other's row; each is positioned under their own parents, and the
// marriage becomes a bar reaching between the two, however far apart that
// ends up being. This is the accepted trade-off: siblings stay contiguous,
// at the cost of a possibly-long cousin-marriage bar.
{
  const laylaOmidUnion = layout.unions.find((u) => u.marriage.id === 'm-layla-omid')!;
  assert(Number.isFinite(laylaOmidUnion.markerX), 'Layla and Omid (cousin marriage, no children) still resolve to a real marker position');
}

// Yusuf & Sana have exactly one child (Tara) between two spouses — the
// "children need less width than the couple does" edge case that the
// width formula's max() exists for. Without it, both spouses would
// collapse onto the same cell.
{
  const yusufX = pos('yusuf').x;
  const sanaX = pos('sana').x;
  assert(yusufX !== sanaX, "Yusuf and Sana don't collapse onto the same cell despite having only one child between them");
  const taraX = pos('tara').x;
  const lo = Math.min(yusufX, sanaX);
  const hi = Math.max(yusufX, sanaX);
  assert(taraX >= lo && taraX <= hi, "Tara sits within her parents' span");
}

// Every marriage's marker actually resolved to a real number (the classic
// symptom of the collapse above is a marker landing on NaN because the two
// spouses' cells left no half-cell candidate between them).
{
  const allFinite = layout.unions.every((u) => Number.isFinite(u.markerX) && Number.isFinite(u.markerY));
  assert(allFinite, 'every union marker resolved to a real, finite position');
}

// The known, accepted limitation: Layla+Omid (a cousin marriage) is
// reachable from both Dara's branch (via Layla) and Noor's branch (via
// Omid) — whichever is processed first actually places it; the other
// still reserves the width (as blank space) rather than double-placing or
// crashing.
{
  const laylaOmidUnion = layout.unions.find((u) => u.marriage.id === 'm-layla-omid')!;
  assert(Number.isFinite(laylaOmidUnion.markerX), "the shared cousin-marriage cluster (Layla+Omid) still resolves to one real position, not two conflicting ones");
}

// The exact scenario the user reported as broken: three siblings, each
// married to an outsider (no recorded parents of their own). Before the
// sibling/spouse redesign, each sibling's *whole marriage cluster*
// (spouse included) was placed as one unit, so the first sibling's spouse
// landed immediately next to the second sibling — visually splitting the
// siblings apart. Now every sibling's spouse is pushed into one shared
// overflow zone after the whole sibling row, at least one empty cell away.
{
  const threeSiblings: FamilyData = {
    people: [
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
      { id: 'aSpouse', name: 'ASpouse' },
      { id: 'bSpouse', name: 'BSpouse' },
      { id: 'cSpouse', name: 'CSpouse' },
    ],
    marriages: [
      { id: 'm-parents', spouseIds: ['p1', 'p2'], status: 'current', childIds: ['a', 'b', 'c'] },
      { id: 'm-a', spouseIds: ['a', 'aSpouse'], status: 'current', childIds: [] },
      { id: 'm-b', spouseIds: ['b', 'bSpouse'], status: 'current', childIds: [] },
      { id: 'm-c', spouseIds: ['c', 'cSpouse'], status: 'current', childIds: [] },
    ],
  };
  const siblingLayout = computeParentChildLayout(threeSiblings);
  const sPos = (id: string) => siblingLayout.positions.get(id)!;
  const siblingXs = ['a', 'b', 'c'].map((id) => sPos(id).x).sort((x, y) => x - y);
  const spouseXs = ['aSpouse', 'bSpouse', 'cSpouse'].map((id) => sPos(id).x);
  const noSpouseBetweenSiblings = spouseXs.every((x) => x < siblingXs[0] || x > siblingXs[2]);
  assert(noSpouseBetweenSiblings, 'none of the three spouses lands between the first and last sibling');
  const siblingsAreContiguousRun = siblingXs[1] - siblingXs[0] === COL_SPACING && siblingXs[2] - siblingXs[1] === COL_SPACING;
  assert(siblingsAreContiguousRun, 'A, B, and C sit in one unbroken contiguous run, each exactly one card apart');
  const closestSpouseGap = Math.min(...spouseXs.map((x) => Math.min(Math.abs(x - siblingXs[0]), Math.abs(x - siblingXs[2]))));
  assert(closestSpouseGap > COL_SPACING, 'every spouse sits at least one full card-space away from the sibling run, not merely adjacent to it');
}

// A real, previously-shipped bug: Kian and Wren (Dara's spouses) have no
// recorded parents of their own, having married in from outside. Checking
// "does nobody in a cluster have recorded parents" person-by-person instead
// of for the whole cluster wrongly called [Kian, Dara, Wren] a *second*
// root too, even though Dara herself has real parents (Elias & Mara) — that
// duplicate root got placed inconsistently with the real one, leaving
// Dara's actual descendants (Layla, Yusuf, Sana, Omid, Tara) with no
// position at all.
{
  const allPositioned = richFamily.people.every((p) => layout.positions.has(p.id));
  assert(allPositioned, 'every person in the fixture gets a position — a spouse with no recorded parents of their own is not mistaken for a second root');
}

// Another real, previously-shipped bug: a shared (cousin-marriage) cluster's
// width got summed into *every* ancestor branch that reaches it, and if one
// of those ancestors is itself shared one generation up, that doubling
// compounds every generation — confirmed to roughly quadruple per
// generation in a family with repeated cousin marriages, reaching absurd
// widths (and an effectively-invisible render scale) within a handful of
// generations. Width must grow linearly with generation count instead.
{
  function chainedCousinFamily(generationCount: number): FamilyData {
    const people: FamilyData['people'] = [];
    const marriages: FamilyData['marriages'] = [];
    let n = 0;
    const id = (prefix: string) => `${prefix}${n++}`;
    const a0 = id('L');
    const b0 = id('R');
    people.push({ id: a0, name: a0 }, { id: b0, name: b0 });
    marriages.push({ id: `m${marriages.length}`, spouseIds: [a0, b0], status: 'current', childIds: [] });
    let coupleA = a0;
    let coupleB = b0;
    for (let g = 1; g <= generationCount; g++) {
      const son = id('S');
      const daughter = id('D');
      people.push({ id: son, name: son }, { id: daughter, name: daughter });
      marriages.find((m) => m.spouseIds.includes(coupleA) && m.spouseIds.includes(coupleB))!.childIds.push(son, daughter);
      const sonSpouse = id('ss');
      const daughterSpouse = id('ds');
      people.push({ id: sonSpouse, name: sonSpouse }, { id: daughterSpouse, name: daughterSpouse });
      marriages.push({ id: `m${marriages.length}`, spouseIds: [son, sonSpouse], status: 'current', childIds: [] });
      marriages.push({ id: `m${marriages.length}`, spouseIds: [daughter, daughterSpouse], status: 'current', childIds: [] });
      const cousinA = id('cA');
      const cousinB = id('cB');
      people.push({ id: cousinA, name: cousinA }, { id: cousinB, name: cousinB });
      marriages.find((m) => m.spouseIds.includes(son) && m.spouseIds.includes(sonSpouse))!.childIds.push(cousinA);
      marriages.find((m) => m.spouseIds.includes(daughter) && m.spouseIds.includes(daughterSpouse))!.childIds.push(cousinB);
      marriages.push({ id: `m${marriages.length}`, spouseIds: [cousinA, cousinB], status: 'current', childIds: [] });
      coupleA = cousinA;
      coupleB = cousinB;
    }
    return { people, marriages };
  }

  const small = computeParentChildLayout(chainedCousinFamily(4));
  const large = computeParentChildLayout(chainedCousinFamily(8));
  // Linear growth means doubling the generation count roughly doubles the
  // width, not squares (or worse) it — allow generous headroom (5x) so this
  // only fails on genuine exponential-style blowup, not minor formula drift.
  assert(large.width < small.width * 5, `width grows roughly linearly with generation count, not exponentially -> 4 generations: ${small.width}, 8 generations: ${large.width}`);
}

// A real, previously-shipped bug: a widow(er) who remarries someone with
// recorded parents elsewhere is completely ordinary — but root candidacy
// used to be excluded the instant *any* marriage was to a parented spouse,
// even when the person also had a genuine root marriage. Grandpa (no
// parents) marries Grandma (no parents) and has Child; Grandma dies,
// Grandpa remarries Widow (who *does* have her own recorded parents,
// Great-grandpa & Great-grandma) and has a second child, Half-sibling. That
// used to silently drop Grandpa's entire original branch — Grandma, Child,
// and everyone under Child — from the layout altogether.
{
  const remarriage: FamilyData = {
    people: [
      { id: 'grandpa', name: 'Grandpa', born: '1920-01-01' },
      { id: 'grandma', name: 'Grandma', born: '1922-01-01' },
      { id: 'child', name: 'Child', born: '1945-01-01' },
      { id: 'great-grandpa', name: 'GreatGrandpa', born: '1895-01-01' },
      { id: 'great-grandma', name: 'GreatGrandma', born: '1897-01-01' },
      { id: 'widow', name: 'Widow', born: '1930-01-01' },
      { id: 'half-sibling', name: 'HalfSibling', born: '1965-01-01' },
    ],
    marriages: [
      { id: 'm-grandparents', spouseIds: ['grandpa', 'grandma'], status: 'ended', childIds: ['child'] },
      { id: 'm-great-grandparents', spouseIds: ['great-grandpa', 'great-grandma'], status: 'current', childIds: ['widow'] },
      { id: 'm-remarriage', spouseIds: ['grandpa', 'widow'], status: 'current', childIds: ['half-sibling'] },
    ],
  };
  const remarriageLayout = computeParentChildLayout(remarriage);
  const allPositioned = remarriage.people.every((p) => remarriageLayout.positions.has(p.id));
  assert(allPositioned, "a widow(er) remarrying someone with recorded parents doesn't drop their original branch (Grandma, Child) from the layout");
}

// A real, previously-shipped bug: a root unit where children come from
// *different* internal marriages (e.g. a person married twice, each
// marriage to a different, otherwise-unconnected root candidate, each with
// its own kids) used to pick one member as "the" anchor and only look at
// *their* children — silently dropping any child that belonged to one of
// the *other* members' marriages instead.
{
  const branchingRoot: FamilyData = {
    people: [
      { id: 'hub', name: 'Hub', born: '1900-01-01' },
      { id: 'firstSpouse', name: 'FirstSpouse', born: '1901-01-01' },
      { id: 'secondSpouse', name: 'SecondSpouse', born: '1905-01-01' },
      { id: 'fromFirst', name: 'FromFirst', born: '1925-01-01' },
      { id: 'fromSecond', name: 'FromSecond', born: '1930-01-01' },
    ],
    marriages: [
      { id: 'm-first', spouseIds: ['hub', 'firstSpouse'], status: 'ended', childIds: ['fromFirst'] },
      { id: 'm-second', spouseIds: ['hub', 'secondSpouse'], status: 'current', childIds: ['fromSecond'] },
    ],
  };
  const branchingLayout = computeParentChildLayout(branchingRoot);
  const allPositioned = branchingRoot.people.every((p) => branchingLayout.positions.has(p.id));
  assert(allPositioned, "a root unit's children scattered across different internal marriages (not all through one member) all still get positioned");
}

// A real, previously-shipped bug: Bridge has no recorded parents, but is
// married to *two* different people — A (also parentless, a genuine root
// pairing with owned children of their own) and E (a real blood descendant
// several generations down, also with a child of their own with Bridge).
// Checking only "no recorded parents" to decide who's a bare spouse
// attachment used to treat Bridge as E's throwaway attachment too, even
// though Bridge is independently a root-unit anchor with owned children —
// positioning Bridge twice, once correctly and once as a phantom
// attachment that could land on top of someone else entirely unrelated.
{
  const bridgeFamily: FamilyData = {
    people: [
      { id: 'a', name: 'A', born: '1900-01-01' },
      { id: 'b', name: 'B', born: '1901-01-01' },
      { id: 'bridge', name: 'Bridge', born: '1899-01-01' },
      { id: 'c', name: 'C', born: '1925-01-01' },
      { id: 'd', name: 'D', born: '1926-01-01' },
      { id: 'e', name: 'E', born: '1950-01-01' },
      { id: 'f', name: 'F', born: '1930-01-01' },
      { id: 'g', name: 'G', born: '1970-01-01' },
    ],
    marriages: [
      { id: 'm-a-b', spouseIds: ['a', 'b'], status: 'current', childIds: ['c'] },
      { id: 'm-a-bridge', spouseIds: ['a', 'bridge'], status: 'ended', childIds: ['f'] },
      { id: 'm-c-d', spouseIds: ['c', 'd'], status: 'current', childIds: ['e'] },
      { id: 'm-bridge-e', spouseIds: ['bridge', 'e'], status: 'current', childIds: ['g'] },
    ],
  };
  const bridgeLayout = computeParentChildLayout(bridgeFamily);
  const allPositioned = bridgeFamily.people.every((p) => bridgeLayout.positions.has(p.id));
  assert(allPositioned, 'everyone gets a position when a root-unit member is also married to an unrelated blood descendant elsewhere');

  const byRow = new Map<number, number[]>();
  bridgeLayout.positions.forEach((p) => {
    const arr = byRow.get(p.y) ?? [];
    arr.push(p.x);
    byRow.set(p.y, arr);
  });
  let overlap = false;
  byRow.forEach((xs) => {
    if (new Set(xs).size !== xs.length) overlap = true;
  });
  assert(!overlap, 'no two cards land on the same cell despite Bridge playing two roles at once');
}

// A real, previously-shipped bug: a woman with real recorded parents
// marries a man who *also* has his own recorded parents, from a family
// line with one more recorded generation than hers. computeGenerations (the
// shared function used by the custom view too) levels a married couple onto
// the same row unless one is a direct ancestor of the other — perfectly
// right for that view, since a couple needs to sit side by side there, but
// wrong here: this view already draws a marriage's bar across however many
// rows separate two spouses, so nothing requires them to be level, and
// leveling them anyway pulled her a full row below her own siblings, into
// the same row as someone else's kids entirely. She must stay with her
// siblings; the marriage's own marker, resolved independently via
// buildUnions using each side's already-correct position, ends up under
// the deeper side (him) since that's the lower of the two rows.
{
  const family: FamilyData = {
    people: [
      { id: 'parent1', name: 'Parent1' },
      { id: 'parent2', name: 'Parent2' },
      { id: 'her', name: 'Her' },
      { id: 'sibling', name: 'Sibling' },
      { id: 'hisGp1', name: 'HisGp1' },
      { id: 'hisGp2', name: 'HisGp2' },
      { id: 'hisParent1', name: 'HisParent1' },
      { id: 'hisParent2', name: 'HisParent2' },
      { id: 'his', name: 'His' },
    ],
    marriages: [
      { id: 'm-parents', spouseIds: ['parent1', 'parent2'], status: 'current', childIds: ['her', 'sibling'] },
      { id: 'm-his-grandparents', spouseIds: ['hisGp1', 'hisGp2'], status: 'current', childIds: ['hisParent1'] },
      { id: 'm-his-parents', spouseIds: ['hisParent1', 'hisParent2'], status: 'current', childIds: ['his'] },
      { id: 'm-her-his', spouseIds: ['her', 'his'], status: 'current', childIds: [] },
    ],
  };
  const layout = computeParentChildLayout(family);
  const herY = layout.positions.get('her')!.y;
  const siblingY = layout.positions.get('sibling')!.y;
  const hisY = layout.positions.get('his')!.y;
  assert(herY === siblingY, "she stays in the same row as her own sibling, not pulled to her husband's deeper row");
  assert(hisY > herY, "setup: his recorded line is genuinely one row deeper than hers");

  const union = layout.unions.find((u) => u.marriage.id === 'm-her-his')!;
  assert(union.markerY > hisY, 'the marriage marker hangs below him (the deeper side), not below her');
}

// A real, previously-shipped bug: an outsider spouse (no recorded parents,
// so no way to derive a blood depth of their own — computeBloodDepth leaves
// it at a permanent 0) married several generations deep into someone else's
// recorded line rendered in generation 0, at the very top of the tree,
// instead of beside the person they're actually drawn next to. Three
// generations of recorded blood line (Ancestor -> Parent -> Child), with
// Child marrying an outsider who has no parents and no siblings of their
// own — the outsider must land in Child's row, not row 0.
{
  const family: FamilyData = {
    people: [
      { id: 'ancestor', name: 'Ancestor' },
      { id: 'parent', name: 'Parent' },
      { id: 'child', name: 'Child' },
      { id: 'outsider', name: 'Outsider' },
    ],
    marriages: [
      { id: 'm-ancestor', spouseIds: ['ancestor', 'ancestor-spouse'], status: 'current', childIds: ['parent'] },
      { id: 'm-parent', spouseIds: ['parent', 'parent-spouse'], status: 'current', childIds: ['child'] },
      { id: 'm-child', spouseIds: ['child', 'outsider'], status: 'current', childIds: [] },
    ],
  };
  // ancestor-spouse and parent-spouse are themselves outsiders too — added
  // implicitly via spouseIds without their own Person entries on purpose,
  // matching how a real "Unknown"/unrecorded spouse shows up in the data.
  family.people.push({ id: 'ancestor-spouse', name: 'AncestorSpouse' }, { id: 'parent-spouse', name: 'ParentSpouse' });

  const layout = computeParentChildLayout(family);
  const childY = layout.positions.get('child')!.y;
  const outsiderY = layout.positions.get('outsider')!.y;
  assert(childY > 0, 'setup: Child is genuinely several rows deep (grandchild of Ancestor)');
  assert(outsiderY === childY, "Outsider (no recorded parents or siblings) lands in Child's own row, not generation 0");

  // A real, previously-shipped bug in the same fixture: Parent is an only
  // child (Ancestor's one recorded child, no siblings of their own), so
  // Parent's *reserved* width is however wide Parent's own combined
  // descendants (Child + Child's outsider spouse) need to be — several
  // columns, growing with every deeper generation. Parent-spouse (an
  // outsider with no parents or siblings) used to be pushed all the way
  // past that entire reserved span instead of sitting next to Parent, the
  // one person they're actually married to — the exact bug placeRootUnit
  // already had a fix for (see "Mara sits close beside Elias" above), just
  // missing from this, the ordinary sibling-row path.
  const parentX = layout.positions.get('parent')!.x;
  const parentSpouseX = layout.positions.get('parent-spouse')!.x;
  assert(
    Math.abs(parentX - parentSpouseX) <= 2 * COL_SPACING,
    "Parent (an only child, no siblings) sits close beside Parent-spouse, not pushed past their own descendants' reserved width"
  );
}

// The gap between generation rows should grow as the tree gets deeper — a
// shallow, two-generation family keeps the plain base spacing (nothing to
// grow from yet), while a deep chain of several generations gets a bigger
// per-row gap throughout, not just a taller *overall* tree from having more
// rows. Building both as simple parent -> child -> ... chains, so any
// height difference is purely from the per-row gap, not from wider rows
// needing more of anything else.
{
  function chain(generationCount: number): FamilyData {
    const people: FamilyData['people'] = [{ id: 'p0', name: 'P0' }];
    const marriages: FamilyData['marriages'] = [];
    for (let g = 1; g <= generationCount; g++) {
      const id = `p${g}`;
      people.push({ id, name: id });
      marriages.push({ id: `m${g}`, spouseIds: [`p${g - 1}`, `p${g - 1}s`], status: 'current', childIds: [id] });
      people.push({ id: `p${g - 1}s`, name: `p${g - 1}s` });
    }
    return { people, marriages };
  }

  // A single generation transition has nothing yet to have "grown" from,
  // so it sits only one increment above the plain base spacing.
  const shallow = computeParentChildLayout(chain(1));
  const shallowGap = shallow.positions.get('p1')!.y - shallow.positions.get('p0')!.y;
  assert(shallowGap > ROW_SPACING && shallowGap < ROW_SPACING * 1.5, `a shallow, two-generation family sits close to the plain base row spacing (got ${shallowGap}, base ${ROW_SPACING})`);

  const deep = computeParentChildLayout(chain(6));
  const deepGap = deep.positions.get('p1')!.y - deep.positions.get('p0')!.y;
  assert(deepGap > shallowGap, `a deep, six-generation family gets a bigger per-row gap than a shallow one (shallow: ${shallowGap}, deep: ${deepGap})`);

  // Every row within the deep tree shares that same, larger gap — this
  // isn't rows getting progressively bigger gaps as they go, just the
  // whole tree's row spacing scaling once, by how deep it is overall.
  const secondDeepGap = deep.positions.get('p2')!.y - deep.positions.get('p1')!.y;
  assert(secondDeepGap === deepGap, 'every generation in the same tree shares the same (grown) row spacing');
}

// A real, previously-shipped bug: three siblings (A, X, Z) — X, the middle
// one, has four children of his own (wide enough to leave real slack in
// his reserved span, since his card centers over just that span rather
// than using all of it) and an outsider wife with no recorded parents or
// siblings. Her spouse's spouse used to always join the *whole row's*
// shared overflow zone, landing past Z (the sibling on the other side of
// X) for a needlessly long marriage line — even though X's own reserved
// span already had room for her right beside him.
{
  const family: FamilyData = {
    people: [
      { id: 'parent1', name: 'Parent1' },
      { id: 'parent2', name: 'Parent2' },
      { id: 'a', name: 'A', born: '1950-01-01' },
      { id: 'x', name: 'X', born: '1955-01-01' },
      { id: 'z', name: 'Z', born: '1960-01-01' },
      { id: 'xWife', name: 'XWife' },
      { id: 'c1', name: 'C1' },
      { id: 'c2', name: 'C2' },
      { id: 'c3', name: 'C3' },
      { id: 'c4', name: 'C4' },
    ],
    marriages: [
      { id: 'm-parents', spouseIds: ['parent1', 'parent2'], status: 'current', childIds: ['a', 'x', 'z'] },
      { id: 'm-x', spouseIds: ['x', 'xWife'], status: 'current', childIds: ['c1', 'c2', 'c3', 'c4'] },
    ],
  };
  const layout = computeParentChildLayout(family);
  const xX = layout.positions.get('x')!.x;
  const zX = layout.positions.get('z')!.x;
  const xWifeX = layout.positions.get('xWife')!.x;
  assert(xWifeX !== zX, "X's wife doesn't collide with Z");
  assert(
    Math.abs(xWifeX - xX) < Math.abs(zX - xX),
    `X's wife sits closer to X than Z (the far sibling) does — X: ${xX}, wife: ${xWifeX}, Z: ${zX}`
  );
  assert(Math.abs(xWifeX - xX) <= 2 * COL_SPACING, `X's wife sits close beside X, not pushed past every sibling (X: ${xX}, wife: ${xWifeX})`);
}

process.exit(process.exitCode ?? 0);
