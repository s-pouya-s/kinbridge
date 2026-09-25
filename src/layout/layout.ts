import type { FamilyData, ID, Marriage } from '../types';
import { computeGenerations } from './generations';
import { computeRowOrder } from './order';

export const NODE_WIDTH = 170;
export const NODE_HEIGHT = 86;
export const COL_SPACING = 200;
export const ROW_SPACING = 316;
/**
 * How many generations' worth of "the tree is getting bigger" scaling
 * (row spacing in computeParentChildLayout, card size + name font in
 * TreeCanvas) keeps accumulating before it holds steady — shared so both
 * grow in lockstep rather than each guessing its own cutoff. Past this
 * many generations, a tree's fit-to-viewport scale is already shrinking
 * enough on its own; letting these keep growing forever past that point
 * would eventually make a single generation's row taller than is useful.
 */
export const GENERATION_GROWTH_CAP = 8;
/** How much a card's height grows per generation of depth — see TreeCanvas's cardHeight. */
export const CARD_HEIGHT_GROWTH_PER_GEN = 6;
/**
 * Card center down to its marriage bar. The bar carries the ⊕ marker
 * (radius MARKER_RADIUS), so this keeps the whole marker clear of even the
 * tallest, fully grown card's bottom edge, plus a few pixels of gap.
 * ROW_SPACING leaves room for two stacked lanes below that before the next
 * row's cards start.
 */
export const MARKER_RADIUS = 28;
export const MAX_CARD_HALF_HEIGHT = (NODE_HEIGHT + GENERATION_GROWTH_CAP * CARD_HEIGHT_GROWTH_PER_GEN) / 2;
export const UNION_OFFSET = MAX_CARD_HALF_HEIGHT + MARKER_RADIUS + 9;
/** Vertical spacing between "lanes" when two marriages' bars would otherwise overlap — see computeLayout. A full marker's width plus a gap, so two stacked markers never touch. */
export const UNION_LANE_STEP = MARKER_RADIUS * 2 + 6;

/**
 * Every size the tree layout depends on, for one card style (see
 * CardStyle). Compact is the plain constants above, which is also the
 * default everywhere, so every existing caller and check keeps its exact
 * numbers. The ⊕ marker and its lanes are the same size in every style.
 */
export interface CardMetrics {
  nodeWidth: number;
  nodeHeight: number;
  colSpacing: number;
  rowSpacing: number;
  /** How much the card grows in height per generation of depth, up to GENERATION_GROWTH_CAP. */
  heightGrowthPerGen: number;
  /** Half the tallest (fully grown) card's height. */
  maxCardHalfHeight: number;
  /** Card center down to its marriage bar; see UNION_OFFSET. */
  unionOffset: number;
}

function metricsFor(nodeWidth: number, nodeHeight: number, colSpacing: number, rowSpacing: number, heightGrowthPerGen: number): CardMetrics {
  const maxCardHalfHeight = (nodeHeight + GENERATION_GROWTH_CAP * heightGrowthPerGen) / 2;
  return { nodeWidth, nodeHeight, colSpacing, rowSpacing, heightGrowthPerGen, maxCardHalfHeight, unionOffset: maxCardHalfHeight + MARKER_RADIUS + 9 };
}

/** Name beside an optional small photo, in a wide, short card. */
export const COMPACT_METRICS = metricsFor(NODE_WIDTH, NODE_HEIGHT, COL_SPACING, ROW_SPACING, CARD_HEIGHT_GROWTH_PER_GEN);
/**
 * A tall, portrait card: a big photo on top, the name under it. Rows sit
 * much further apart to fit it, with the same room below each row for a
 * marriage lane, its ⊕, and the child lines as compact has.
 */
export const LARGE_METRICS = metricsFor(200, 256, 240, 500, 8);

export type CardStyle = 'compact' | 'large';
export const CARD_METRICS: Record<CardStyle, CardMetrics> = { compact: COMPACT_METRICS, large: LARGE_METRICS };

export interface Point {
  x: number;
  y: number;
}

export interface LayoutUnion {
  marriage: Marriage;
  /**
   * Where the connecting bar between the two spouses sits: their row +
   * UNION_OFFSET, plus one UNION_LANE_STEP per "lane" this marriage got
   * stacked into to keep its bar from overlapping another one in the same
   * row (see computeLayout) — entirely automatic, never user-movable.
   */
  barY: number;
  /**
   * The tappable ⊕ marker's position, on that same lane's line. Always
   * exactly halfway between two whole cells (see computeLayout) — never on
   * a whole cell itself, so it can never land on top of a card — chosen
   * from every such half-cell between the two spouses as whichever sits
   * closest to this marriage's own children, not just the one nearest the
   * true midpoint.
   */
  markerX: number;
  markerY: number;
}

export interface Layout {
  positions: Map<ID, Point>;
  unions: LayoutUnion[];
  /** The row (generation) each person is actually drawn on, 0 at the top. Only computeParentChildLayout fills this in. */
  generationOf?: Map<ID, number>;
  /** The smallest (most-negative-capable) and largest x among all positions — the tree's true horizontal extent, in the same raw cell*COL_SPACING units as positions.x. Rendering uses these to size/position the canvas around content that doesn't necessarily start at x=0; see TreeCanvas. */
  minX: number;
  maxX: number;
  width: number;
  height: number;
  /** The deepest generation actually present (0 for a single-generation tree) — TreeCanvas uses this, capped the same way computeParentChildLayout's own rowSpacing is, to grow card size and name font right along with it. */
  maxGen: number;
}

/**
 * Lays out the whole tree on a grid: row = generation, column = a numbered
 * cell within that row (see Person.manualOrder — a row with no manual
 * positions at all just uses dense consecutive cell numbers 0, 1, 2, ...;
 * once anyone in a row is manually positioned, every cell number in that row
 * is used literally, gaps included, so an empty cell a card was moved out of
 * renders as visible breathing room instead of being compacted away). Since
 * cell numbers within a row are always distinct, two people can never land
 * on the same one — card overlap is structurally impossible, not just
 * visually unlikely.
 *
 * Deliberately *not* centered or edge-aligned relative to other rows, and
 * *never* renormalized to start at any particular x: a person's x is exactly
 * their own cell number times COL_SPACING, full stop — nothing else about
 * the tree affects it. So moving one card (or swapping two) only ever
 * changes the position of the person(s) actually moved; nobody else's cell
 * number changes, so nobody else's x changes, in that row or any other, no
 * matter how far anyone drifts (even negative). `minX`/`maxX` report the
 * resulting extent purely for sizing/positioning the canvas around that
 * content — they never feed back into anyone's own position.
 *
 * `priorityPair` re-runs the same deterministic algorithm biased to keep one
 * couple adjacent — this is what "tap to recenter" animates towards.
 */
export function computeLayout(data: FamilyData, priorityPair?: [ID, ID]): Layout {
  const generations = computeGenerations(data);
  const rows = computeRowOrder(data, generations, priorityPair);
  const maxGen = Math.max(0, ...Array.from(generations.values()));
  const peopleById = new Map(data.people.map((p) => [p.id, p]));

  const positions = new Map<ID, Point>();
  for (let g = 0; g <= maxGen; g++) {
    const row = rows.get(g) ?? [];
    // A row is either fully automatic (nobody's manualOrder is set — dense
    // 0..n-1 by construction order) or fully manual (see the mutations that
    // set it, which always snapshot the *whole* row together so there's
    // never a mix that would make "cell number" ambiguous for the unset
    // ones).
    const isManual = row.some((id) => peopleById.get(id)?.manualOrder != null);
    row.forEach((id, i) => {
      const cell = isManual ? peopleById.get(id)?.manualOrder ?? i : i;
      positions.set(id, { x: cell * COL_SPACING, y: g * ROW_SPACING });
    });
  }

  const xs = Array.from(positions.values()).map((p) => p.x);
  const minX = xs.length > 0 ? Math.min(...xs) : 0;
  const maxX = xs.length > 0 ? Math.max(...xs) : 0;
  const maxWidth = maxX - minX + COL_SPACING;

  return {
    positions,
    unions: buildUnions(data.marriages, positions),
    minX,
    maxX,
    width: maxWidth,
    height: (maxGen + 1) * ROW_SPACING,
    maxGen,
  };
}

interface RawUnion {
  marriage: Marriage;
  rowY: number;
  minX: number;
  maxX: number;
  minCell: number;
  maxCell: number;
  candidates: number[];
}

/**
 * Builds every marriage's bar + marker from a completed position map —
 * shared by every layout strategy (see computeParentChildLayout too), since
 * once everyone has an x/y, turning that into bars/markers doesn't depend
 * on *how* those positions were decided.
 */
export function buildUnions(marriages: Marriage[], positions: Map<ID, Point>, metrics: CardMetrics = COMPACT_METRICS): LayoutUnion[] {
  const { colSpacing } = metrics;
  // The marker's own cell is deliberately always a *half*-cell — exactly
  // between two adjacent whole cells — never a whole cell itself, so it can
  // never land on top of any card, occupied or not: cards only ever sit at
  // whole cells. Every half-cell between the two spouses is an equally
  // valid "no card" spot, not just the one nearest the true midpoint, so
  // each marriage ranks all of them by closeness to its own children's
  // average cell (nearest the bar's own center when it has none yet, so far
  // ties favor the later cell).
  const rawUnions: RawUnion[] = marriages.map((m) => {
    const [a, b] = m.spouseIds;
    const pa = positions.get(a);
    const pb = positions.get(b);
    const ax = pa?.x ?? 0;
    const bx = pb?.x ?? 0;
    // The *lower* of the two spouses' rows, not just whichever happens to
    // be spouseIds[0] — normally the same row (spouses are leveled), but a
    // cross-generation marriage (an ancestor marrying their own descendant,
    // the one pairing generations.ts deliberately never levels) leaves them
    // on two different rows, and the bar/marker belongs under the younger
    // one, not floating above them at the elder's row.
    const rowY = Math.max(pa?.y ?? 0, pb?.y ?? 0);
    const minCell = Math.min(ax, bx) / colSpacing;
    const maxCell = Math.max(ax, bx) / colSpacing;

    const childCells = m.childIds
      .map((childId) => positions.get(childId)?.x)
      .filter((x): x is number => x != null)
      .map((x) => x / colSpacing);
    const targetCell = childCells.length > 0 ? childCells.reduce((sum, c) => sum + c, 0) / childCells.length : (minCell + maxCell) / 2;

    const candidates: number[] = [];
    for (let c = minCell + 0.5; c < maxCell; c += 1) candidates.push(c);
    // Two spouses in the same column (only possible across generations,
    // see rowY above) have no half-cell between them; the one just beside
    // that column still never lands on a card. Without this the marker had
    // no x at all and was never drawn.
    if (candidates.length === 0) candidates.push(minCell + 0.5);
    candidates.sort((x, y) => {
      const dx = Math.abs(x - targetCell);
      const dy = Math.abs(y - targetCell);
      return dx !== dy ? dx - dy : y - x; // ties: prefer the later (larger) cell
    });

    return { marriage: m, rowY, minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minCell, maxCell, candidates };
  });

  // Two marriages whose bars don't overlap (different lanes, or even
  // different generations entirely aren't possible here — always the same
  // row) can still each rank the *same* half-cell as their own best pick —
  // e.g. two unrelated marriages both have children clustered under the
  // same spot. Landing both markers at that x, just UNION_LANE_STEP apart in
  // y, reads as one doubled-up marker rather than two distinct ones. Assign
  // markers one row at a time, each one taking its best still-free
  // candidate and removing it from that row's pool — a marriage with fewer
  // options of its own (a short span) goes before one with many, so the
  // wide-open marriage is the one that has to compromise if there's a clash.
  const markerCellByMarriageId = new Map<ID, number>();
  const occupiedByRow = new Map<number, Set<number>>();
  const placementOrder = rawUnions
    .slice()
    .sort((x, y) => x.maxCell - x.minCell - (y.maxCell - y.minCell) || x.marriage.id.localeCompare(y.marriage.id));
  for (const u of placementOrder) {
    const occupied = occupiedByRow.get(u.rowY) ?? new Set<number>();
    const chosen = u.candidates.find((c) => !occupied.has(c)) ?? u.candidates[0];
    occupied.add(chosen);
    occupiedByRow.set(u.rowY, occupied);
    markerCellByMarriageId.set(u.marriage.id, chosen);
  }

  // A marriage's bar spans from one spouse to the other, which isn't always
  // adjacent columns — computeRowOrder clusters a person adjacent to all
  // their same-generation marriages at once where it can, but a marriage
  // between two people from opposite ends of a big row (or a manually
  // reordered one) still has to span the cards between them. Two such bars
  // in the same row can then overlap along the x-axis; drawn on the same
  // line they'd become one unreadable tangle. Interval-partition each row's
  // unions into "lanes" — greedily reusing a lane once its last bar has
  // ended, opening a new one (stacked one UNION_LANE_STEP lower) only when
  // the current bar would otherwise overlap it — entirely automatic, so
  // overlapping bars always land on visibly different lines without needing
  // anyone to move anything.
  const byRow = new Map<number, RawUnion[]>();
  for (const u of rawUnions) {
    const arr = byRow.get(u.rowY) ?? [];
    arr.push(u);
    byRow.set(u.rowY, arr);
  }
  const laneByMarriageId = new Map<ID, number>();
  byRow.forEach((rowUnions) => {
    const sorted = rowUnions.slice().sort((x, y) => x.minX - y.minX || x.marriage.id.localeCompare(y.marriage.id));
    const laneEnds: number[] = [];
    for (const u of sorted) {
      let lane = laneEnds.findIndex((end) => end <= u.minX);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = u.maxX;
      laneByMarriageId.set(u.marriage.id, lane);
    }
  });

  return rawUnions.map((u) => {
    const barY = u.rowY + metrics.unionOffset + (laneByMarriageId.get(u.marriage.id) ?? 0) * UNION_LANE_STEP;
    const markerX = markerCellByMarriageId.get(u.marriage.id)! * colSpacing;
    return { marriage: u.marriage, barY, markerX, markerY: barY };
  });
}

/**
 * Mirrors an x-coordinate for right-to-left display by reflecting it about
 * the midpoint of the tree's own true extent (minX/maxX from computeLayout,
 * not 0..width) — that midpoint is invariant under the reflection, which is
 * what lets RTL and LTR agree on where the content is centered without
 * either of them needing to renormalize anyone's actual position.
 */
export function mirrorX(x: number, minX: number, maxX: number): number {
  return minX + maxX - x;
}
