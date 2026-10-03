import type { FamilyData, ID, Person } from '../types';
import { byBirth, groupsOf, keepBornTogether, orderedChildIds } from './siblings';
import { COMPACT_METRICS, GENERATION_GROWTH_CAP, MARKER_RADIUS, buildUnions, cardSize, type CardMetrics, type Layout, type LayoutUnion, type Point } from './layout';
import { segmentCrossesBox } from './routes';

/**
 * An alternate, "descendant chart" layout: every child sits directly under
 * its parents, and a marriage's marker is always exactly centered over its
 * own children — trading the density of computeLayout's packed rows for
 * unambiguous parent-child lines.
 *
 * The base unit here is a *blood person*, not a marriage — siblings (blood
 * children of the same parents) always render as one contiguous run, with
 * each sibling centered over their own descendants. A sibling's spouse with
 * no recorded parents of their own (they married in from outside) sits in
 * the very next cell beside them, with no gap; if the spouse *does* have
 * recorded parents, they're not placed here at all,
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
/** Empty cells between two neighboring groups of siblings with different parents (cousins). */
export const FAMILY_GAP = 1;
/** Empty cells between two separate founding families, at their closest point on every row. */
export const ROOT_FAMILY_GAP = 3;

export interface LayoutOptions {
  /** Empty cells between separate founding families. The main tree keeps ROOT_FAMILY_GAP; the one-person view needs no more than between cousins. */
  rootFamilyGap?: number;
}

export function computeParentChildLayout(data: FamilyData, metrics: CardMetrics = COMPACT_METRICS, options: LayoutOptions = {}): Layout {
  // Every size below comes from the card style (see CardMetrics); only the
  // spacing changes between styles, never which cell or row anyone lands in.
  const COL_SPACING = metrics.colSpacing;
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
  const rowSpacing = metrics.rowSpacing + Math.min(maxGen, GENERATION_GROWTH_CAP) * GENERATION_GAP_GROWTH_PER_GEN;

  const peopleById = new Map<ID, Person>(data.people.map((p) => [p.id, p]));
  const byBirthDate = byBirth(peopleById);

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
    let kids: ID[] = [];
    let anyManual = false;
    for (const m of data.marriages) {
      if (!m.spouseIds.includes(personId)) continue;
      const owner = sharedOwner.get(m.id);
      if (owner != null && owner !== personId) continue;
      anyManual = anyManual || !!m.manualChildOrder;
      for (const c of orderedChildIds(m, peopleById)) {
        if (!seen.has(c)) {
          seen.add(c);
          kids.push(c);
        }
      }
    }
    // Children of several marriages are normally interleaved by birth date.
    // Once any of those marriages has a hand-set order, dates can't be
    // trusted to line up with it, so each marriage's children stay together
    // in their own order instead, one marriage after another.
    if (!anyManual) kids = kids.sort(byBirthDate);
    // Children born together always stay side by side.
    kids = keepBornTogether(
      kids,
      data.marriages.filter((m) => m.spouseIds.includes(personId)).flatMap(groupsOf)
    );
    bloodChildrenCache.set(personId, kids);
    return kids;
  };

  // A blood person's outsider spouses: married in, with no independent
  // claim to a position of their own (no recorded parents, and not a
  // root-unit member either). Being free to go anywhere, they sit right
  // beside the person they married. That second condition matters: a
  // parentless person can still be a legitimate root-unit anchor with owned
  // children of their own (they just also happen to be someone else's
  // spouse elsewhere in the tree); checking only "no recorded parents" used
  // to treat them as a bare attachment anyway, positioning them a second
  // time and colliding with whoever else landed there (a real,
  // previously-shipped bug).
  // An outsider married into more than one family sits beside the partner
  // on the highest row (the first one, on a tie). Beside a lower one, their
  // children with a higher partner landed on a row above them (a real,
  // previously-shipped bug). Their straight line down to any lower
  // marriage keeps its column clear (see dropUntil).
  const homePartnerOf = (outsiderId: ID): ID | undefined => {
    let home: ID | undefined;
    for (const partner of spousesOf.get(outsiderId) ?? []) {
      if (home == null || (bloodDepth.get(partner) ?? 0) < (bloodDepth.get(home) ?? 0)) home = partner;
    }
    return home;
  };
  const outsiderSpousesOf = (personId: ID): ID[] => (spousesOf.get(personId) ?? []).filter((spouseId) => !isAnchor(spouseId) && homePartnerOf(spouseId) === personId);

  // A branch laid out on its own, before it's put in its final place:
  // every card in it at a cell relative to the branch, and, for each row it
  // touches, the leftmost and rightmost cell it uses there. `depth` is the
  // row its top people (the siblings or root members themselves) are on.
  interface Shape {
    members: { id: ID; cell: number; depth: number }[];
    /** Per row, the first and last card. Cells kept empty for a line (RESERVED members) don't count. */
    rows: Map<number, { min: number; max: number }>;
    depth: number;
  }
  const toShape = (members: Shape['members'], depth: number): Shape => {
    const rows = new Map<number, { min: number; max: number }>();
    for (const m of members) {
      if (m.id === RESERVED) continue;
      const r = rows.get(m.depth);
      rows.set(m.depth, r ? { min: Math.min(r.min, m.cell), max: Math.max(r.max, m.cell) } : { min: m.cell, max: m.cell });
    }
    return { members, rows, depth };
  };

  // Puts shapes side by side, left to right, as close as their rows allow:
  // each one slides left until, on some row they share, it would come
  // within one cell of what's already there. Only the rows a branch really
  // uses count, so a childless person sits right beside a sibling whose
  // many children spread out underneath them, instead of past all of
  // those children. On rows below the shapes' own row (cousins and further)
  // two families keep FAMILY_GAP empty cells between them; on their own row
  // siblings touch. `familyGap` (separate root families) replaces both
  // with that many empty cells on every row.
  const packShapes = (shapes: Shape[], familyGap?: number): Shape => {
    const members: Shape['members'] = [];
    const rows = new Map<number, { min: number; max: number }>();
    // Cells kept empty for a straight line (RESERVED), and cells with a
    // card, so far. A reserved cell is a single hole: other cards may sit
    // right beside it on both sides, as long as none lands on it.
    const reservedCells = new Set<string>();
    const cardCells = new Set<string>();
    // The rows the siblings themselves sit on. Only there may two shapes
    // touch: a sibling pushed onto a lower row by a hand-set generation
    // still keeps the gap from their nephews and nieces there.
    const siblingRows = new Set<number>();
    for (const shape of shapes) {
      let offset = 0;
      if (rows.size > 0) {
        let need = -Infinity;
        for (const [d, r] of shape.rows) {
          const left = rows.get(d);
          if (!left) continue;
          const gap = familyGap != null ? 1 + familyGap : d === shape.depth && siblingRows.has(d) ? 1 : 1 + FAMILY_GAP;
          need = Math.max(need, left.max + gap - r.min);
        }
        // No row in common (only with hand-set generations): just go after
        // everything so far.
        if (need === -Infinity) {
          const leftMax = Math.max(...Array.from(rows.values(), (r) => r.max));
          const shapeMin = Math.min(...Array.from(shape.rows.values(), (r) => r.min));
          need = leftMax + 1 + (familyGap ?? FAMILY_GAP) - shapeMin;
        }
        offset = need;
        // Then further right while a card would land on a reserved cell, or
        // a reserved cell on a card.
        const clashes = (off: number) =>
          shape.members.some((m) => (m.id === RESERVED ? cardCells : reservedCells).has(`${m.cell + off}:${m.depth}`));
        while (clashes(offset)) offset += 1;
      }
      siblingRows.add(shape.depth);
      for (const m of shape.members) (m.id === RESERVED ? reservedCells : cardCells).add(`${m.cell + offset}:${m.depth}`);
      for (const m of shape.members) members.push({ ...m, cell: m.cell + offset });
      for (const [d, r] of shape.rows) {
        const cur = rows.get(d);
        const min = r.min + offset;
        const max = r.max + offset;
        rows.set(d, cur ? { min: Math.min(cur.min, min), max: Math.max(cur.max, max) } : { min, max });
      }
    }
    return { members, rows, depth: Math.min(...shapes.map((sh) => sh.depth)) };
  };

  // Everyone already given a cell, so nobody is laid out twice: an outsider
  // remarried into two different blood lines stays with the first.
  const claimed = new Set<ID>();

  // Spouse lines are always straight: down from each spouse's card to the
  // bar, then across (see makeUnionRouter). The bar sits under the lower
  // spouse's row, so a spouse on a higher row has a line running straight
  // down through every row in between, and the cells right under them on
  // those rows must stay empty (a real, previously-shipped bug: a man's line
  // to his wife, one generation lower, ran through the card under him).
  // Cards move out of the way; lines never bend. dropUntil is the lowest
  // row each such spouse's line reaches.
  const rowOf = (id: ID) => bloodDepth.get(isAnchor(id) ? id : homePartnerOf(id) ?? id) ?? 0;
  const dropUntil = new Map<ID, number>();
  for (const m of data.marriages) {
    const [a, b] = m.spouseIds;
    const ra = rowOf(a);
    const rb = rowOf(b);
    if (ra < rb) dropUntil.set(a, Math.max(dropUntil.get(a) ?? 0, rb));
    if (rb < ra) dropUntil.set(b, Math.max(dropUntil.get(b) ?? 0, ra));
  }
  const dropRowsOf = (id: ID, depth: number): number[] => {
    const until = dropUntil.get(id) ?? depth;
    return Array.from({ length: Math.max(0, until - depth) }, (_, i) => depth + 1 + i);
  };
  const isFree = (members: Shape['members'], cell: number, rows: number[]) => !members.some((m) => m.cell === cell && rows.includes(m.depth));
  // A cell kept empty for a spouse line; never drawn, only packed around.
  const RESERVED = '';
  const reserveDrops = (members: Shape['members']): Shape['members'] => [
    ...members,
    ...members.flatMap((m) => (m.id === RESERVED ? [] : dropRowsOf(m.id, m.depth).map((r) => ({ id: RESERVED, cell: m.cell, depth: r })))),
  ];
  // The free cell nearest `cell` (then to its right, then left) whose
  // column is empty on all of `rows`.
  const nearestFree = (members: Shape['members'], cell: number, rows: number[]) => {
    for (let step = 0; ; step++) {
      if (isFree(members, cell + step, rows)) return cell + step;
      if (step > 0 && isFree(members, cell - step, rows)) return cell - step;
    }
  };

  // One blood person's branch: their children's row (each child with their
  // own branch, see packShapes), the person centered over that row, and
  // their outsider spouses in the very next cells, no gap between them.
  //
  // The person is centered over their children's actual cards, never over
  // the whole span of their branch (which also holds those children's
  // spouses). Centering on that instead would drag the person visually off
  // of their children (a real, previously-shipped bug: Elias drifted past
  // Noor into Dara's spouses).
  //
  // Each person's own blood depth decides their row, never a single row
  // assumed for a whole batch: siblings are normally all one generation,
  // but Person.manualGeneration can push one of them deeper without moving
  // the others. An outsider spouse takes their partner's row, since
  // computeBloodDepth leaves anyone without recorded parents at 0 whichever
  // generation they married into (a real, previously-shipped bug: a wife
  // with no recorded parents landed at the very top of the tree).
  const branchShape = (personId: ID): Shape => {
    claimed.add(personId);
    const depth = bloodDepth.get(personId) ?? 0;
    const kids = bloodChildrenOf(personId).filter((k) => !claimed.has(k));
    // Children moved down by hand (a hand-set generation) sit on a lower
    // row than their siblings. Their straight line from the ⊕ passes the
    // rows in between, so they go directly under this person, in columns
    // kept empty on those rows (see below).
    // Deepest first, so they sit nearest this person: a line then only
    // crosses rows above its own child, where no other lowered child's card
    // is in its way (several lowered children on different rows, from two
    // marriages, once had one child's line run through the others' cards).
    const lowered = kids.filter((k) => (bloodDepth.get(k) ?? 0) > depth + 1).sort((a, b) => (bloodDepth.get(b) ?? 0) - (bloodDepth.get(a) ?? 0));
    const regular = kids.filter((k) => !lowered.includes(k));
    const members: Shape['members'] = [];
    let cardCell = 0;
    if (regular.length > 0) {
      const kidsShape = packShapes(regular.map(branchShape));
      const kidCells = kidsShape.members.filter((m) => regular.includes(m.id)).map((m) => m.cell);
      cardCell = Math.floor((Math.min(...kidCells) + Math.max(...kidCells)) / 2);
      members.push(...kidsShape.members);
    }
    const spouses = outsiderSpousesOf(personId).filter((s) => !claimed.has(s));

    // Centered over the children, unless something is in the way of a
    // straight line down: this person's or a spouse's line to a marriage on
    // a lower row, or the lines to lowered children. Then the nearest
    // column where every one of those lines is clear, with the whole couple
    // moving together so spouses stay side by side.
    // The lowered children, packed together like any siblings (each with
    // their spouse beside them), laid out once; where the group can go is
    // part of choosing this person's column. `first` is the cell of the
    // first lowered child within the group.
    const loweredGroup = lowered.length > 0 ? packShapes(lowered.map(branchShape)) : null;
    const loweredCells = loweredGroup ? loweredGroup.members.filter((m) => lowered.includes(m.id)).map((m) => m.cell) : [];
    const first = Math.min(...loweredCells);
    // Where the first lowered child goes, counted from this person's
    // column: right under them, unless that would put the group on a column
    // kept empty for this couple's own straight lines down (this person's,
    // then each spouse's to the right); then further right, past them.
    const coupleLines = new Set([
      ...dropRowsOf(personId, depth).map((r) => `0:${r}`),
      ...spouses.flatMap((sp, i) => dropRowsOf(sp, depth).map((r) => `${1 + i}:${r}`)),
    ]);
    let groupShift = 0;
    while (loweredGroup && loweredGroup.members.some((g) => coupleLines.has(`${g.cell - first + groupShift}:${g.depth}`))) groupShift += 1;
    const loweredStart = (c: number) => c + groupShift;
    // The group fits when none of its cards lands within FAMILY_GAP of a
    // card already there (they're cousins of that row's people) or on a
    // reserved cell.
    const loweredFit = (c: number) => {
      if (!loweredGroup) return true;
      const offset = loweredStart(c) - first;
      return loweredGroup.members.every(
        (g) => !members.some((m) => m.depth === g.depth && (m.id === RESERVED || g.id === RESERVED ? m.cell === g.cell + offset : Math.abs(m.cell - g.cell - offset) <= FAMILY_GAP))
      );
    };
    // The straight lines from the ⊕ beside this person to the lowered
    // children cross the rows in between over these columns.
    // Each lowered child's own clear path: the columns between this person
    // and that child, on just the rows its line crosses (between this row
    // and the child's).
    const cellOf = new Map(loweredGroup ? loweredGroup.members.filter((m) => lowered.includes(m.id)).map((m) => [m.id, m.cell]) : []);
    const corridor = (c: number): { col: number; row: number }[] =>
      lowered.flatMap((k) => {
        const kc = loweredStart(c) + cellOf.get(k)! - first;
        const kDepth = bloodDepth.get(k) ?? 0;
        const out: { col: number; row: number }[] = [];
        for (let col = Math.min(c, kc); col <= Math.max(c, kc); col++) for (let row = depth + 1; row < kDepth; row++) out.push({ col, row });
        return out;
      });
    const fits = (c: number) =>
      isFree(members, c, dropRowsOf(personId, depth)) &&
      spouses.every((s, i) => isFree(members, c + 1 + i, dropRowsOf(s, depth))) &&
      corridor(c).every(({ col, row }) => isFree(members, col, [row])) &&
      loweredFit(c);
    for (let step = 0; ; step++) {
      if (fits(cardCell + step)) {
        cardCell += step;
        break;
      }
      if (step > 0 && fits(cardCell - step)) {
        cardCell -= step;
        break;
      }
    }
    members.push({ id: personId, cell: cardCell, depth });
    spouses.forEach((s, i) => {
      claimed.add(s);
      members.push({ id: s, cell: cardCell + 1 + i, depth });
    });

    // The lowered children under this person, the columns their lines
    // pass kept empty on the rows in between.
    if (loweredGroup) {
      const offset = loweredStart(cardCell) - first;
      members.push(...loweredGroup.members.map((m) => ({ ...m, cell: m.cell + offset })));
      for (const { col, row } of corridor(cardCell)) members.push({ id: RESERVED, cell: col, depth: row });
    }

    const own = members.filter((m) => m.id === personId || spouses.includes(m.id));
    return toShape([...members, ...reserveDrops(own).slice(own.length)], depth);
  };

  // A root unit has no siblings of its own to keep apart, so there's no
  // reason to push its other members far away. The common case (one member
  // has all the unit's owned children: sharedOwner guarantees exactly one
  // does, for any marriage internal to this unit; everyone else has none)
  // lays that one member out like any blood person, and the others in the
  // very next cells, not past that member's entire branch (a real,
  // previously-shipped bug: Mara ended up implausibly far from Elias). The
  // rare case, more than one member independently having owned children
  // (two remarriages, each with kids from a different spouse), has no
  // single card to put everyone beside, so they're packed like siblings.
  const rootUnitShape = (members: ID[]): Shape => {
    const depthOf = (id: ID) => bloodDepth.get(id) ?? 0;
    const withKids = members.filter((id) => bloodChildrenOf(id).length > 0);
    const unitDepth = Math.min(...members.map(depthOf));

    if (withKids.length === 0) {
      members.forEach((id) => claimed.add(id));
      return toShape(reserveDrops(members.map((id, i) => ({ id, cell: i, depth: depthOf(id) }))), unitDepth);
    }

    if (withKids.length > 1) return packShapes(members.map(branchShape));

    const anchor = withKids[0];
    const anchorShape = branchShape(anchor);
    const anchorCell = anchorShape.members.find((m) => m.id === anchor)!.cell;
    const others = members.filter((id) => id !== anchor);
    others.forEach((id) => claimed.add(id));
    const placed = [...anchorShape.members];
    let nextCell = anchorCell + 1;
    for (const id of others) {
      while (!isFree(placed, nextCell, [depthOf(id), ...dropRowsOf(id, depthOf(id))])) nextCell += 1;
      placed.push({ id, cell: nextCell, depth: depthOf(id) });
      nextCell += 1;
    }
    return toShape(reserveDrops(placed), unitDepth);
  };

  // Separate founding families keep ROOT_FAMILY_GAP empty cells between
  // them wherever they come closest, on every row.
  const whole = packShapes(rootUnits.map(rootUnitShape), options.rootFamilyGap ?? ROOT_FAMILY_GAP);
  const firstCell = Math.min(0, ...whole.members.map((m) => m.cell));
  const positions = new Map<ID, Point>();
  for (const m of whole.members) if (m.id !== RESERVED) positions.set(m.id, { x: (m.cell - firstCell) * COL_SPACING, y: m.depth * rowSpacing });

  // Defensive final pass: the packing above assumes every row it
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

  // A row whose marriages' bars overlap stacks them into lanes (see
  // buildUnions), each one UNION_LANE_STEP lower. The plain rowSpacing only
  // leaves room for two, so with three or more the lowest ⊕ markers reached
  // down into the next row's cards. Lanes depend only on x, so build the
  // unions once, then give each row the height its own deepest lane needs:
  // a busy row pushes every row below it down, a quiet row keeps the
  // normal gap.
  // Captured before the rows are respaced below: right now every y is
  // still exactly depth * rowSpacing.
  const generationOf = new Map(Array.from(positions, ([id, p]) => [id, Math.round(p.y / rowSpacing)]));
  const firstUnions = buildUnions(data.marriages, positions, metrics);
  const deepestBarBelowRow = new Map<number, number>();
  for (const u of firstUnions) {
    const rowY = Math.max(...u.marriage.spouseIds.map((id) => positions.get(id)?.y ?? 0));
    deepestBarBelowRow.set(rowY, Math.max(deepestBarBelowRow.get(rowY) ?? 0, u.barY - rowY));
  }
  // Below the deepest marker: its radius, then room for the child lines to
  // leave it before they reach the next row's (possibly fully grown) cards.
  const CHILD_LINE_ROOM = 40;
  const rowTop = new Map<number, number>();
  let y = 0;
  for (let depth = 0; depth <= maxGen; depth++) {
    const oldY = depth * rowSpacing;
    rowTop.set(oldY, y);
    const deepest = deepestBarBelowRow.get(oldY);
    y += deepest == null ? rowSpacing : Math.max(rowSpacing, deepest + MARKER_RADIUS + CHILD_LINE_ROOM + metrics.maxCardHalfHeight);
  }
  const moved = Array.from(positions.values()).some((p) => rowTop.get(p.y) !== p.y);
  if (moved) {
    for (const [id, p] of positions) positions.set(id, { x: p.x, y: rowTop.get(p.y) ?? p.y });
  }

  const unions = moved ? buildUnions(data.marriages, positions, metrics) : firstUnions;

  // Children's lines run straight from the ⊕ to each child. buildUnions
  // puts the ⊕ on the half-cell between the spouses closest to their
  // children; when a line from there would cross some card (a child far
  // to one side, or one moved down a row by hand), move the ⊕ to the
  // nearest other half-cell between the spouses from which every child's
  // line is clear. Cards are measured at the size they're drawn (cardSize).
  const card = cardSize(maxGen, metrics);
  const boxes = Array.from(positions, ([id, p]) => ({ id, x0: p.x - card.width / 2, y0: p.y - card.height / 2, x1: p.x + card.width / 2, y1: p.y + card.height / 2 }));
  const childLinesClear = (u: LayoutUnion, markerX: number) =>
    u.marriage.childIds.every((childId) => {
      const c = positions.get(childId);
      if (!c) return true;
      const a = { x: markerX, y: u.markerY };
      const b = { x: c.x, y: c.y - card.height / 2 };
      return !boxes.some(
        (box) =>
          box.id !== childId &&
          box.x1 >= Math.min(a.x, b.x) &&
          box.x0 <= Math.max(a.x, b.x) &&
          box.y1 >= a.y &&
          box.y0 <= b.y &&
          segmentCrossesBox(a, b, box.x0 + 0.5, box.y0 + 0.5, box.x1 - 0.5, box.y1 - 0.5)
      );
    });
  const markerSpots = new Set(unions.map((u) => `${u.markerX},${u.markerY}`));
  for (const u of unions) {
    if (childLinesClear(u, u.markerX)) continue;
    const xs = u.marriage.spouseIds.map((id) => positions.get(id)?.x ?? 0);
    const lo = Math.min(...xs) / COL_SPACING;
    const hi = Math.max(...xs) / COL_SPACING;
    const candidates: number[] = [];
    for (let c = lo + 0.5; c < hi; c += 1) candidates.push(c * COL_SPACING);
    candidates.sort((x, y) => Math.abs(x - u.markerX) - Math.abs(y - u.markerX));
    const better = candidates.find((x) => !markerSpots.has(`${x},${u.markerY}`) && childLinesClear(u, x));
    if (better == null) continue;
    markerSpots.delete(`${u.markerX},${u.markerY}`);
    markerSpots.add(`${better},${u.markerY}`);
    u.markerX = better;
  }

  return {
    positions,
    unions,
    generationOf,
    minX,
    maxX,
    width: maxX - minX + COL_SPACING,
    height: y,
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
  // A spouse who married in (no parents of their own, and every spouse of
  // theirs has parents) is always drawn on a partner's row, so a hand-set
  // generation means nothing for them. Honoring it anyway pushed their
  // children rows further down than their parents, and those children's
  // straight lines then ran through the rows in between.
  const hasParents = new Set(data.marriages.flatMap((m) => m.childIds));
  const marriedIn = (id: ID) =>
    !hasParents.has(id) && data.marriages.some((m) => m.spouseIds.includes(id)) && data.marriages.every((m) => !m.spouseIds.includes(id) || m.spouseIds.every((s) => s === id || hasParents.has(s)));
  data.people.forEach((p) => depth.set(p.id, marriedIn(p.id) ? 0 : Math.max(0, p.manualGeneration ?? 0)));

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
