import type { ID } from '../types';
import type { Layout, LayoutUnion, Point } from './layout';
import { groupsOf } from './siblings';

/** The lines one marriage draws, as polylines in layout coordinates. */
export interface UnionRoutes {
  /** One per spouse: straight down from the bottom of their card to the bar, then along the bar to the ⊕. Together they make the bar. */
  spouses: [Point[], Point[]];
  /** One per child: one straight line from the ⊕ to the top of the child's card, or, for a child born together with siblings, from their split point. */
  children: { childId: ID; points: Point[] }[];
  /**
   * One per group of children born together (twins, triplets, ...) on one
   * row: the thicker line from the ⊕ down to the point where it splits to
   * each of them.
   */
  trunks: { childIds: ID[]; points: Point[] }[];
}

/**
 * The lines a marriage draws. They are never bent around anything: a
 * spouse's line goes straight down to the bar and the bar runs straight
 * across. Keeping cards off those lines is the layout's job (see
 * computeParentChildLayout's reserved columns), never the drawing's.
 *
 * Shared by TreeCanvas (lines and minimap), the PDF and the checks, so they
 * all draw exactly the same thing. `cardHeight` is the height cards are
 * actually drawn at (see cardSize).
 */
export function makeUnionRouter(layout: Layout, cardHeight: number): (u: LayoutUnion) => UnionRoutes | null {
  const half = cardHeight / 2;
  return (u) => {
    const a = layout.positions.get(u.marriage.spouseIds[0]);
    const b = layout.positions.get(u.marriage.spouseIds[1]);
    if (!a || !b) return null;
    const marker = { x: u.markerX, y: u.markerY };
    const spouseLine = (p: Point): Point[] => [{ x: p.x, y: p.y + half }, { x: p.x, y: marker.y }, marker];
    // Children born together on one row: one line down to a split point
    // above the middle of them, 60% of the way down, then one to each.
    // (Members on different rows, one moved down by hand, get plain lines.)
    const splitOf = new Map<ID, Point>();
    const trunks: UnionRoutes['trunks'] = [];
    for (const group of groupsOf(u.marriage)) {
      const cards = group.map((id) => layout.positions.get(id));
      if (cards.some((c) => !c) || new Set(cards.map((c) => c!.y)).size > 1) continue;
      const top = cards[0]!.y - half;
      const split = { x: cards.reduce((sum, c) => sum + c!.x, 0) / cards.length, y: marker.y + (top - marker.y) * 0.6 };
      trunks.push({ childIds: group, points: [marker, split] });
      for (const id of group) splitOf.set(id, split);
    }
    const children = u.marriage.childIds.flatMap((childId) => {
      const c = layout.positions.get(childId);
      return c ? [{ childId, points: [splitOf.get(childId) ?? marker, { x: c.x, y: c.y - half }] }] : [];
    });
    return { spouses: [spouseLine(a), spouseLine(b)], children, trunks };
  };
}

/** A polyline as its straight pieces. */
export function segmentsOf(points: Point[]): { x1: number; y1: number; x2: number; y2: number }[] {
  return points.slice(1).map((p, i) => ({ x1: points[i].x, y1: points[i].y, x2: p.x, y2: p.y }));
}

/** Does the segment a-b pass through the inside of the box? (Liang-Barsky clipping.) */
export function segmentCrossesBox(a: Point, b: Point, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ]) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t1 - t0 > 1e-9;
}
