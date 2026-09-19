import type { FamilyData, ID, Person } from '../types';
import { COL_SPACING, GENERATION_GROWTH_CAP, ROW_SPACING, buildUnions, type Layout, type Point } from './layout';

/** Empty cells between a row of blood siblings and its outsider-spouse overflow zone. */
const OUTSIDER_GAP = 1;

/**
 * An alternate, "descendant chart" layout: every child sits directly under
 * its parents, and a marriage's marker is always exactly centered over its
 * own children — trading the density of computeLayout's packed rows for
 * unambiguous parent-child lines.
 *
 * The base unit here is a *blood person*, not a marriage — siblings (blood
 * children of the same parents) always render as one contiguous run, with
 * each sibling centered over their own descendants. A sibling's spouse is
 * never wedged between siblings: if the spouse has no recorded parents of
 * their own (they married in from outside), they're placed in an overflow
 * zone after the whole sibling row, at least one empty cell away — if the
 * spouse *does* have recorded parents, they're not placed here at all,
 * since they're a blood person themselves and get positioned under their
 * own parents instead (that marriage becomes a bar reaching over to
 * whatever bar their actual position ends up at, however far that is —
 * the one genuinely inherent limitation of "everyone sits under their own
 * parents": two blood lines that intermarry can't both have the couple
 * directly between them).
 *
 * Returns the same Layout shape computeLayout does, so TreeCanvas's
 * rendering, gestures, zoom/pan, and selection/highlighting all work
 * unchanged regardless of which one produced it.
 */
export function computeParentChildLayout(data: FamilyData): Layout {
  // Deliberately not computeGenerations (the shared function used for both
  // views) — that one levels a married pair onto the same row, which is
  // right for computeLayout's packed rows (a couple needs to sit side by
  // side) but wrong here: this view already draws a marriage's bar across
  // however many rows separate the two spouses (see buildUnions), so
  // there's nothing forcing them level in the first place, and doing it
  // anyway pulls someone away from their own siblings' row the moment they
  // marry into a family whose recorded lineage runs one generation deeper
  // or shallower than their own (a real, previously-shipped bug: a woman
  // rendered a full row below her actual siblings because her husband's
  // side of the family happened to have one more recorded generation).
  // Blood depth alone — root is 0, each child is one more than their own
  // parents, spouses never pull each other anywhere — is both simpler and
  // exactly what this view needs.
  const bloodDepth = computeBloodDepth(data);

  // The gap between adjacent generation rows grows with the tree's own
  // depth rather than staying fixed — a couple of generations sit fine at
  // the base spacing, but a deep tree accumulates enough people and
  // marriages per row that the same fixed gap starts to feel visually
  // packed once several of those busier rows are stacked on top of each
  // other. Capped so an unusually deep tree doesn't keep stretching the
  // whole layout out forever — every generation past the cap keeps the
  // same (already-larger) spacing rather than continuing to grow.
  const maxGen = Math.max(0, ...Array.from(bloodDepth.values()));
  const GENERATION_GAP_GROWTH_PER_GEN = 16;
  const rowSpacing = ROW_SPACING + Math.min(maxGen, GENERATION_GROWTH_CAP) * GENERATION_GAP_GROWTH_PER_GEN;

  const peopleById = new Map<ID, Person>(data.people.map((p) => [p.id, p]));
  const byBirth = (a: ID, b: ID) => (peopleById.get(a)?.born ?? '9999-99-99').localeCompare(peopleById.get(b)?.born ?? '9999-99-99');

  const hasParentMarriage = new Set<ID>();
  for (const m of data.marriages) for (const c of m.childIds) hasParentMarriage.add(c);

  const spousesOf = new Map<ID, ID[]>();
  for (const m of data.marriages) {
    const [a, b] = m.spouseIds;
    (spousesOf.get(a) ?? spousesOf.set(a, []).get(a)!).push(b);
    (spousesOf.get(b) ?? spousesOf.set(b, []).get(b)!).push(a);
  }

  // A parentless person is "absorbed" as some blood descendant's spouse
  // instead of being a root — but only when *every* one of their marriages
  // is to someone who has recorded parents. A real, previously-shipped bug:
  // this used to exclude someone from root candidacy if *any* marriage was
  // to a parented spouse, even when they also had a genuine root marriage —
  // a widow(er) who remarries someone with recorded parents elsewhere is a
  // completely ordinary case, and it silently dropped their entire original
  // branch (root marriage, and every descendant under it) from the layout
  // altogether. Two mutually parentless spouses (a founding couple) are
  // both still root candidates, and get grouped into one root unit below
  // rather than two separate ones; someone with no marriages at all is
  // trivially still their own root.
  const isRootCandidate = (id: ID) => {
    if (hasParentMarriage.has(id)) return false;
    const spouses = spousesOf.get(id) ?? [];
    return spouses.length === 0 || spouses.some((s) => !hasParentMarriage.has(s));
  };

  // Anyone who's ever independently treated as an "anchor" — someone whose
  // own bloodChildrenOf gets queried directly, rather than only ever being
  // referenced as somebody else's spouse: every blood descendant, plus
  // every root-unit member (root units are placed the same way a sibling
  // row is, see below).
  const isAnchor = (id: ID) => hasParentMarriage.has(id) || isRootCandidate(id);

  // A marriage where *both* spouses are anchors is reachable as a blood
  // child from both sides — most commonly a cousin marriage (both have
  // their own recorded parents), but a root-unit member remarrying a blood
  // descendant hits the same ambiguity. Left unresolved, both sides would
  // independently count that marriage's children into their own width, and
  // if those children are themselves in another such marriage next
  // generation, the doubling compounds into exponential blowup (a real,
  // previously-shipped bug). Pick exactly one side to own the children —
  // the deeper of the two (their own blood depth, not the marriage's), since
  // the children's depth is one past the deeper parent anyway, and centering
  // them under the shallower parent instead would put that parent's own card
  // oddly far above its children. Birth date, then spouseIds order, breaks
  // an exact tie so results stay deterministic.
  const sharedOwner = new Map<string, ID>();
  for (const m of data.marriages) {
    if (m.childIds.length === 0) continue;
    const [a, b] = m.spouseIds;
    if (isAnchor(a) && isAnchor(b)) {
      const depthA = bloodDepth.get(a) ?? 0;
      const depthB = bloodDepth.get(b) ?? 0;
      if (depthA !== depthB) {
        sharedOwner.set(m.id, depthA > depthB ? a : b);
      } else {
        const bornA = peopleById.get(a)?.born ?? '9999-99-99';
        const bornB = peopleById.get(b)?.born ?? '9999-99-99';
        sharedOwner.set(m.id, bornA <= bornB ? a : b);
      }
    }
  }

  // Root units: connected components of root candidates, linked only by
  // marriages where *both* sides are root candidates — a founding couple is
  // one 2-person unit; a lone unmarried root is its own 1-person unit.
  const rootUnitIndexOf = new Map<ID, number>();
  const rootUnits: ID[][] = [];
  for (const p of data.people) {
    if (!isRootCandidate(p.id) || rootUnitIndexOf.has(p.id)) continue;
    const idx = rootUnits.length;
    const stack = [p.id];
    const members: ID[] = [];
    rootUnitIndexOf.set(p.id, idx);
    while (stack.length > 0) {
      const current = stack.pop()!;
      members.push(current);
      for (const spouseId of spousesOf.get(current) ?? []) {
        if (isRootCandidate(spouseId) && !rootUnitIndexOf.has(spouseId)) {
          rootUnitIndexOf.set(spouseId, idx);
          stack.push(spouseId);
        }
      }
    }
    rootUnits.push(orderClusterMembers(members, data));
  }

  // A blood person's own children — every childId from every marriage
  // *they're* in. Unambiguous: a child belongs to exactly one marriage, so
  // exactly one person's own list ever includes them.
  const bloodChildrenCache = new Map<ID, ID[]>();
  const bloodChildrenOf = (personId: ID): ID[] => {
    const cached = bloodChildrenCache.get(personId);
    if (cached) return cached;
    const seen = new Set<ID>();
    const kids: ID[] = [];
    for (const m of data.marriages) {
      if (!m.spouseIds.includes(personId)) continue;
      const owner = sharedOwner.get(m.id);
      if (owner != null && owner !== personId) continue;
      for (const c of m.childIds) {
        if (!seen.has(c)) {
          seen.add(c);
          kids.push(c);
        }
      }
    }
    kids.sort(byBirth);
    bloodChildrenCache.set(personId, kids);
    return kids;
  };

  // The outsider spouses of every sibling in a row, deduped — these are
  // what need the overflow zone. An outsider is someone with no independent
  // claim to a position of their own: not a blood descendant, AND not a
  // root-unit member. That second condition matters — a parentless person
  // can still be a legitimate root-unit anchor with owned children of their
  // own (they just also happen to be someone else's spouse elsewhere in the
  // tree); checking only "no recorded parents" used to treat them as a bare
  // attachment anyway, positioning them a second time and colliding with
  // whoever else that overflow slot landed on (a real, previously-shipped
  // bug).
  const outsiderSpousesOf = (siblingIds: ID[]): ID[] => {
    const outsiders: ID[] = [];
    for (const personId of siblingIds) {
      for (const spouseId of spousesOf.get(personId) ?? []) {
        if (!isAnchor(spouseId) && !outsiders.includes(spouseId)) outsiders.push(spouseId);
      }
    }
    return outsiders;
  };

  // An outsider spouse has no recorded parents of their own, so
  // computeBloodDepth leaves their personal depth at a permanent 0 (nothing
  // ever raises it — that only happens for a person's *children*, never for
  // the person themselves). Using that 0 directly rendered every outsider
  // spouse in generation 0 regardless of which generation they actually
  // married into (a real, previously-shipped bug: a wife with no recorded
  // parents or siblings landed at the very top of the tree instead of next
  // to the husband she's actually drawn beside). They belong at whichever
  // blood sibling's row they're attached to — that sibling's own depth, not
  // their own.
  const outsiderRowDepth = (outsiderId: ID, siblingIds: ID[]): number => {
    const anchor = siblingIds.find((id) => (spousesOf.get(id) ?? []).includes(outsiderId));
    return bloodDepth.get(anchor ?? outsiderId) ?? 0;
  };

  // Width needed to render a row of blood siblings *plus* their outsider
  // spouses' overflow — this is what a parent must reserve for its
  // children, so a deeper generation's overflow can never spill into a
  // sibling's own territory one row up.
  const rowWidth = (siblingIds: ID[]): number => {
    if (siblingIds.length === 0) return 0;
    const bloodWidth = siblingIds.reduce((sum, id) => sum + personWidth(id), 0);
    const outsiderCount = outsiderSpousesOf(siblingIds).length;
    return outsiderCount > 0 ? bloodWidth + OUTSIDER_GAP + outsiderCount : bloodWidth;
  };

  const widthByPerson = new Map<ID, number>();
  function personWidth(personId: ID): number {
    const cached = widthByPerson.get(personId);
    if (cached != null) return cached;
    widthByPerson.set(personId, 1); // cycle guard (malformed data only)
    const kids = bloodChildrenOf(personId);
    const width = kids.length === 0 ? 1 : rowWidth(kids);
    widthByPerson.set(personId, width);
    return width;
  }

  const positions = new Map<ID, Point>();

  // A person's own card centers over the actual rendered span of their
  // blood children — never over the full reserved width, which (via
  // rowWidth) also pads in room for those children's own outsider spouses.
  // Centering on the padded width instead would drag the person visually
  // off of their children and into that padding (a real, previously-
  // shipped bug: Elias drifted past Noor into Dara's spouses' overflow
  // zone).
  const centerCellOverChildren = (kids: ID[], fallbackCell: number): number => {
    if (kids.length === 0) return fallbackCell;
    const xs = kids.map((k) => positions.get(k)!.x / COL_SPACING);
    return Math.floor((Math.min(...xs) + Math.max(...xs)) / 2);
  };

  // Places a row of blood siblings contiguously, each centered over their
  // own descendants, then appends every sibling's outsider spouse (if any)
  // after a gap — see the module doc comment for why. Returns the cell just
  // past the whole row, so a caller placing multiple such rows in sequence
  // (or a root unit, below) knows where the next one starts.
  //
  // Each person's *own* row (from computeGenerations) decides their y —
  // never a single row assumed for the whole batch. Siblings are normally
  // all the same generation, but computeGenerations' spousal leveling can
  // push one of them deeper (they married someone from a later generation
  // who isn't their own direct descendant — a cousin-type marriage across
  // an age gap, not the parent/child case that's already excluded) without
  // moving the others. Assuming they all share one row used to render that
  // sibling at the wrong y *and* hand their real, deeper-generation
  // relatives' row to everyone else in the batch too — landing two
  // unrelated people on the exact same cell (a real, previously-shipped
  // bug). x-placement (width/cursor) stays generation-agnostic, so this
  // costs nothing when everyone's row already agrees, which is the case
  // for every family this doesn't happen to apply to.
  const placeSiblingRow = (siblingIds: ID[], leftCell: number): number => {
    let cursor = leftCell;
    // Each sibling's own reserved span (their personWidth's worth of
    // cells) plus which cell their own card actually landed on within it
    // — a sibling with descendants wide enough to need outsider-spouse
    // room of their own (see rowWidth) reserves more than their single
    // card cell uses, and whatever's left over, still within their own
    // span, is genuinely free at this row: nothing else at this sibling's
    // own generation occupies it, only their descendants one row down.
    const territoryBySibling = new Map<ID, { end: number; nextFreeCell: number }>();
    for (const personId of siblingIds) {
      const w = personWidth(personId);
      const kids = bloodChildrenOf(personId);
      if (kids.length > 0) placeSiblingRow(kids, cursor);
      const cardCell = centerCellOverChildren(kids, cursor);
      const y = (bloodDepth.get(personId) ?? 0) * rowSpacing;
      positions.set(personId, { x: cardCell * COL_SPACING, y });
      cursor += w;
      territoryBySibling.set(personId, { end: cursor, nextFreeCell: cardCell + 1 + OUTSIDER_GAP });
    }
    const outsiders = outsiderSpousesOf(siblingIds);
    if (outsiders.length > 0) {
      if (siblingIds.length === 1) {
        // An only child (no actual siblings here to protect from being
        // split apart) doesn't need their spouse pushed all the way past
        // their own reserved width — that reservation is however wide this
        // person's *combined descendants* need to be, which the spouse has
        // no reason to sit beyond. Put them right beside this person's own
        // card instead, the same way placeRootUnit already tucks a root
        // couple's second member beside the first rather than past their
        // whole descendant span (a real, previously-shipped bug there, this
        // is the same bug in the sibling-row path: an only child's spouse
        // landed however far away as their descendants happened to be
        // wide — often several generations' worth of width — instead of
        // next to the person they're actually married to).
        const soloCell = positions.get(siblingIds[0])!.x / COL_SPACING;
        let spouseCell = soloCell + 1 + OUTSIDER_GAP;
        for (const spouseId of outsiders) {
          if (positions.has(spouseId)) continue;
          const y = outsiderRowDepth(spouseId, siblingIds) * rowSpacing;
          positions.set(spouseId, { x: spouseCell * COL_SPACING, y });
          spouseCell += 1;
        }
        cursor = Math.max(cursor, spouseCell);
      } else {
        // With real siblings on both sides, a spouse still can't be wedged
        // between two of them — but "between siblings" only actually means
        // *touching the next sibling's own territory*, not merely
        // somewhere within this sibling's own reserved span. If this
        // specific spouse's anchor has room to spare there (see
        // territoryBySibling above), tuck them in right beside their own
        // spouse instead of joining everyone else's shared overflow zone
        // at the very end of the row — a real, previously-shipped bug:
        // someone with several children (whose own outsider spouses
        // widened this person's reserved span well past their single
        // card) still had their *own* spouse pushed out past every
        // sibling who came after them, for a needlessly long marriage
        // line, even though their own reserved span already had the
        // room. Only the overflow that doesn't fit anywhere close still
        // goes to the shared zone, same as before.
        const overflow: ID[] = [];
        for (const spouseId of outsiders) {
          if (positions.has(spouseId)) continue;
          const anchorId = siblingIds.find((id) => (spousesOf.get(id) ?? []).includes(spouseId));
          const territory = anchorId ? territoryBySibling.get(anchorId) : undefined;
          if (territory && territory.nextFreeCell < territory.end) {
            const y = outsiderRowDepth(spouseId, siblingIds) * rowSpacing;
            positions.set(spouseId, { x: territory.nextFreeCell * COL_SPACING, y });
            territory.nextFreeCell += 1;
          } else {
            overflow.push(spouseId);
          }
        }
        if (overflow.length > 0) {
          cursor += OUTSIDER_GAP;
          for (const spouseId of overflow) {
            // Already placed via an earlier row — a rare case (an outsider
            // remarried into two different blood lines) — leave them be
            // rather than moving or duplicating them.
            if (positions.has(spouseId)) continue;
            const y = outsiderRowDepth(spouseId, siblingIds) * rowSpacing;
            positions.set(spouseId, { x: cursor * COL_SPACING, y });
            cursor += 1;
          }
        }
      }
    }
    return cursor;
  };

  // A root unit has no siblings of its own to protect the adjacency of, so
  // unlike a sibling row, there's no reason to push its other members far
  // away. The common case (one member has all the unit's owned children —
  // sharedOwner guarantees exactly one does, for any marriage internal to
  // this unit — everyone else has none) puts that one member's card exactly
  // where a lone blood person's would be, and tucks everyone else one
  // card-space beside it — not wherever they'd land after that member's
  // *entire* reserved width, several cells of their own spouses' overflow
  // later (a real, previously-shipped bug: Mara ended up implausibly far
  // from Elias). The rare case — more than one member independently has
  // owned children, e.g. two remarriages each with kids from a different
  // spouse — has no single card to tuck everyone beside, so it just falls
  // back to the plain sibling-row treatment.
  const placeRootUnit = (unitIdx: number, leftCell: number): number => {
    const members = rootUnits[unitIdx];
    const withKids = members.filter((id) => bloodChildrenOf(id).length > 0);

    if (withKids.length === 0) {
      members.forEach((id, i) => positions.set(id, { x: (leftCell + i) * COL_SPACING, y: (bloodDepth.get(id) ?? 0) * rowSpacing }));
      return leftCell + members.length;
    }

    if (withKids.length > 1) return placeSiblingRow(members, leftCell);

    const anchor = withKids[0];
    const kids = bloodChildrenOf(anchor);
    placeSiblingRow(kids, leftCell);
    const w = personWidth(anchor);
    const anchorCell = centerCellOverChildren(kids, leftCell);
    positions.set(anchor, { x: anchorCell * COL_SPACING, y: (bloodDepth.get(anchor) ?? 0) * rowSpacing });

    let attachCell = anchorCell + 1 + OUTSIDER_GAP;
    for (const id of members) {
      if (id === anchor) continue;
      positions.set(id, { x: attachCell * COL_SPACING, y: (bloodDepth.get(id) ?? 0) * rowSpacing });
      attachCell += 1;
    }
    return Math.max(leftCell + w, attachCell);
  };

  let cursor = 0;
  for (let unitIdx = 0; unitIdx < rootUnits.length; unitIdx++) {
    cursor = placeRootUnit(unitIdx, cursor);
  }

  // Defensive final pass: the width/cursor math above assumes every row it
  // reserves space in is generation-agnostic, which holds as long as
  // computeGenerations' output is well-behaved — but a sufficiently
  // tangled remarriage graph (someone married into several other lines,
  // each looping back through collateral relatives rather than a direct
  // ancestor/descendant pair) can push it into unbounded relaxation, which
  // is capped rather than fixed, and two genuinely unrelated people can
  // end up sharing both a row *and*, by coincidence, a cell within it. No
  // card should ever visually render on top of another regardless of how
  // it got there, so nudge any later-placed duplicate to the next free
  // cell in its row rather than leaving it stacked. Iterates in placement
  // order (a Map's insertion order), so nothing already-placed ever moves —
  // only a newcomer landing on an occupied cell shifts.
  const occupiedCellsByRow = new Map<number, Set<number>>();
  for (const [id, p] of positions) {
    const occupied = occupiedCellsByRow.get(p.y) ?? new Set<number>();
    let cell = p.x / COL_SPACING;
    while (occupied.has(cell)) cell += 1;
    occupied.add(cell);
    occupiedCellsByRow.set(p.y, occupied);
    if (cell * COL_SPACING !== p.x) positions.set(id, { x: cell * COL_SPACING, y: p.y });
  }

  const xs = Array.from(positions.values()).map((p) => p.x);
  const minX = xs.length > 0 ? Math.min(...xs) : 0;
  const maxX = xs.length > 0 ? Math.max(...xs) : 0;

  return {
    positions,
    unions: buildUnions(data.marriages, positions),
    minX,
    maxX,
    width: maxX - minX + COL_SPACING,
    height: (maxGen + 1) * rowSpacing,
    maxGen,
  };
}

/**
 * Each person's depth in their own blood line — 0 for anyone with no
 * recorded parents, one more than the deeper of their two parents
 * otherwise. Unlike computeGenerations (src/layout/generations.ts), spouses
 * never affect each other's depth here — see computeParentChildLayout's own
 * comment for why that's the right call specifically for this view. Also
 * respects Person.manualGeneration as a seed, same as computeGenerations,
 * for the same reason: aligning an unconnected second family's root with
 * the right row of the first, or nudging a freshly-added parent down toward
 * their child by hand when they'd otherwise default to row 0.
 */
function computeBloodDepth(data: FamilyData): Map<ID, number> {
  const depth = new Map<ID, number>();
  data.people.forEach((p) => depth.set(p.id, Math.max(0, p.manualGeneration ?? 0)));

  const maxIterations = data.people.length + data.marriages.length + 5;
  for (let i = 0; i < maxIterations; i++) {
    let changed = false;
    for (const m of data.marriages) {
      const parentDepth = Math.max(depth.get(m.spouseIds[0]) ?? 0, depth.get(m.spouseIds[1]) ?? 0);
      for (const childId of m.childIds) {
        if ((depth.get(childId) ?? 0) < parentDepth + 1) {
          depth.set(childId, parentDepth + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return depth;
}

/**
 * Orders a root unit's members into a single line via the chain of
 * marriages connecting them, earliest-married first — lets a remarried
 * root (rare, but possible: someone with no recorded parents who married
 * twice, both times to someone *else* with no recorded parents) read as
 * [earlier spouse, the person, later spouse] instead of an arbitrary order.
 */
function orderClusterMembers(members: ID[], data: FamilyData): ID[] {
  if (members.length <= 1) return members;
  const memberSet = new Set(members);
  const edges = new Map<ID, { other: ID; year: number }[]>();
  for (const m of data.marriages) {
    const [a, b] = m.spouseIds;
    if (!memberSet.has(a) || !memberSet.has(b)) continue;
    const year = m.marriedYear ?? Number.MAX_SAFE_INTEGER;
    (edges.get(a) ?? edges.set(a, []).get(a)!).push({ other: b, year });
    (edges.get(b) ?? edges.set(b, []).get(b)!).push({ other: a, year });
  }
  for (const list of edges.values()) list.sort((x, y) => x.year - y.year);

  const start = members.find((id) => (edges.get(id)?.length ?? 0) <= 1) ?? members[0];
  const ordered: ID[] = [start];
  const seen = new Set([start]);
  let current = start;
  while (ordered.length < members.length) {
    const next = (edges.get(current) ?? []).map((e) => e.other).find((id) => !seen.has(id));
    if (!next) break;
    ordered.push(next);
    seen.add(next);
    current = next;
  }
  for (const id of members) if (!seen.has(id)) ordered.push(id);
  return ordered;
}
