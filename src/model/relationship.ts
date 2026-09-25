import type { FamilyData, ID } from '../types';

/** How a step's person is related to the person just before them in the path. */
export type RelationLink = 'parent' | 'child' | 'spouse';

export interface PathStep {
  personId: ID;
  /** Unset on the first step. `parent` means this person is the previous one's parent. */
  link?: RelationLink;
  /** The marriage this step goes through: the one between the two spouses, or the one the child was born to. */
  marriageId?: ID;
}

/**
 * Tried after every blood link, so of two equally short routes the one
 * through blood relatives wins, and a route only goes through a marriage
 * when that's genuinely shorter.
 */
const SPOUSE_COST = 1.001;
/** At most this many different routes are offered, shortest first. */
const MAX_ROUTES = 5;
/** Candidate routes looked at before merging look-alikes (see findRelationshipRoutes). */
const MAX_CANDIDATES = 24;

interface Edge {
  to: ID;
  link: RelationLink;
  marriageId: ID;
  cost: number;
}

/** Parent, child and spouse links between everyone, in both directions. */
function buildGraph(data: FamilyData): Map<ID, Edge[]> {
  const edges = new Map<ID, Edge[]>();
  const add = (from: ID, to: ID, link: RelationLink, marriageId: ID, cost: number) => {
    const list = edges.get(from) ?? [];
    list.push({ to, link, marriageId, cost });
    edges.set(from, list);
  };
  for (const m of data.marriages) {
    const [a, b] = m.spouseIds;
    add(a, b, 'spouse', m.id, SPOUSE_COST);
    add(b, a, 'spouse', m.id, SPOUSE_COST);
    for (const child of m.childIds) {
      for (const parent of m.spouseIds) {
        add(child, parent, 'parent', m.id, 1);
        add(parent, child, 'child', m.id, 1);
      }
    }
  }
  return edges;
}

/** A binary min-heap of [cost, person] pairs, for Dijkstra's frontier. Stale entries are skipped by the caller. */
class MinHeap {
  private items: [number, ID][] = [];
  get size() {
    return this.items.length;
  }
  push(cost: number, id: ID) {
    const items = this.items;
    items.push([cost, id]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop(): [number, ID] {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l][0] < items[smallest][0]) smallest = l;
        if (r < items.length && items[r][0] < items[smallest][0]) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

const edgeKey = (from: ID, to: ID, marriageId?: ID) => `${from}>${to}>${marriageId ?? ''}`;

/**
 * Dijkstra over a binary heap, skipping any
 * person in `bannedPeople` and any link in `bannedEdges`. The route from
 * `fromId` to `toId` as steps, with its total cost, or null.
 */
function shortestRoute(graph: Map<ID, Edge[]>, fromId: ID, toId: ID, bannedPeople: Set<ID>, bannedEdges: Set<string>): { steps: PathStep[]; cost: number } | null {
  const dist = new Map<ID, number>([[fromId, 0]]);
  const prev = new Map<ID, { from: ID; link: RelationLink; marriageId: ID }>();
  const done = new Set<ID>();
  const queue = new MinHeap();
  queue.push(0, fromId);
  let reached = false;
  while (queue.size > 0) {
    const [best, current] = queue.pop();
    if (done.has(current)) continue;
    if (current === toId) {
      reached = true;
      break;
    }
    done.add(current);
    for (const e of graph.get(current) ?? []) {
      if (bannedPeople.has(e.to) || bannedEdges.has(edgeKey(current, e.to, e.marriageId))) continue;
      const d = best + e.cost;
      if (d < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, d);
        prev.set(e.to, { from: current, link: e.link, marriageId: e.marriageId });
        queue.push(d, e.to);
      }
    }
  }
  if (!reached) return null;

  const steps: PathStep[] = [];
  let at: ID = toId;
  while (at !== fromId) {
    const p = prev.get(at)!;
    steps.push({ personId: at, link: p.link, marriageId: p.marriageId });
    at = p.from;
  }
  steps.push({ personId: fromId });
  return { steps: steps.reverse(), cost: dist.get(toId)! };
}

const routeCost = (steps: PathStep[]) => steps.reduce((sum, s) => sum + (s.link == null ? 0 : s.link === 'spouse' ? SPOUSE_COST : 1), 0);
/**
 * True for a route that takes a pointless detour through one marriage: two
 * steps in a row via the same marriage are only meaningful as up to the
 * parents and back down to their other child (siblings). Every other pair
 * is just the long way round a direct link: up to Mom and across to her
 * husband instead of straight up to Dad, down to a son and back up to his
 * father instead of across to one's husband, and so on.
 */
function hasDetour(steps: PathStep[]): boolean {
  for (let i = 1; i < steps.length - 1; i++) {
    const a = steps[i];
    const b = steps[i + 1];
    if (a.marriageId && a.marriageId === b.marriageId && !(a.link === 'parent' && b.link === 'child')) return true;
  }
  return false;
}

const routeKey = (steps: PathStep[]) => steps.map((s) => `${s.personId}/${s.marriageId ?? ''}`).join(' ');

/**
 * Every different way two people are connected, shortest first, like the
 * route choices a map app offers — for example a couple who are also
 * distant cousins: the marriage itself, and the long way round through
 * their shared ancestors. Each route is the list of everyone on it (both
 * ends included), each with how they relate to the one before. Links are
 * parent, child and spouse; brothers, cousins and so on come out as the
 * route through their shared parents and ancestors.
 *
 * Found with Yen's k-shortest-paths algorithm, skipping detours (see
 * hasDetour). Routes that would draw the exact same chart are merged into
 * one: going up to Grandpa or to Grandma is the same route once the chart
 * shows them together as a couple (see buildRelationshipChart). A route
 * that only loops around a shorter one is dropped too. Empty when the two aren't connected at all
 * (for example, two separate trees in the same file).
 */
export function findRelationshipRoutes(data: FamilyData, fromId: ID, toId: ID): PathStep[][] {
  if (fromId === toId) return [[{ personId: fromId }]];
  const graph = buildGraph(data);
  const first = shortestRoute(graph, fromId, toId, new Set(), new Set());
  if (!first) return [];

  const found: PathStep[][] = [first.steps];
  const candidates: { steps: PathStep[]; cost: number }[] = [];
  const seen = new Set([routeKey(first.steps)]);
  while (found.length < MAX_CANDIDATES) {
    const last = found[found.length - 1];
    for (let i = 0; i < last.length - 1; i++) {
      const root = last.slice(0, i + 1);
      const rootKey = routeKey(root);
      const bannedEdges = new Set<string>();
      for (const route of found) {
        if (route.length > i + 1 && routeKey(route.slice(0, i + 1)) === rootKey) {
          bannedEdges.add(edgeKey(route[i].personId, route[i + 1].personId, route[i + 1].marriageId));
        }
      }
      const bannedPeople = new Set(root.slice(0, -1).map((s) => s.personId));
      const spur = shortestRoute(graph, root[i].personId, toId, bannedPeople, bannedEdges);
      if (!spur) continue;
      const steps = [...root, ...spur.steps.slice(1)];
      const key = routeKey(steps);
      if (seen.has(key)) continue;
      seen.add(key);
      if (hasDetour(steps)) continue;
      candidates.push({ steps, cost: routeCost(steps) });
    }
    if (candidates.length === 0) break;
    candidates.sort((a, b) => a.cost - b.cost);
    found.push(candidates.shift()!.steps);
  }

  const charts = new Set<string>();
  const routes: PathStep[][] = [];
  const between = (steps: PathStep[]) => steps.slice(1, -1).map((st) => st.personId);
  for (const steps of found) {
    const chartKey = buildRelationshipChart(data, steps)
      .nodes.map((n) => n.personId)
      .sort()
      .join(' ');
    if (charts.has(chartKey)) continue;
    // A longer route through everyone a shorter one already goes through is
    // just that route plus a loop (sister to brother via their shared
    // father, but first out through her husband's family and back), not a
    // different connection. A direct link (nobody in between) never
    // disqualifies anything: a couple who are also cousins really are
    // connected both ways.
    const people = new Set(between(steps));
    if (routes.some((r) => between(r).length > 0 && between(r).every((id) => people.has(id)))) continue;
    charts.add(chartKey);
    routes.push(steps);
    if (routes.length === MAX_ROUTES) break;
  }
  return routes;
}

/** The single shortest route (see findRelationshipRoutes), or null when the two aren't connected. */
export function findRelationshipPath(data: FamilyData, fromId: ID, toId: ID): PathStep[] | null {
  return findRelationshipRoutes(data, fromId, toId)[0] ?? null;
}

export interface ChartNode {
  personId: ID;
  col: number;
  row: number;
  /** False only for the other half of a couple at the top of the route, shown beside their spouse. */
  onPath: boolean;
  /** The step that reached this person (unset for the first person and for an added spouse). */
  step?: PathStep;
  /** Who they're related to in that step: the person just before them in the route. */
  prevPersonId?: ID;
}

export type ChartLink = { kind: 'marriage'; a: ID; b: ID } | { kind: 'descent'; parents: ID[]; child: ID };

/**
 * Lays a route out as a small chart: one column per person, left to right in
 * route order, one row per generation (older higher), so a cousin route
 * reads as an upside-down V with the shared ancestors at its peak. Where the
 * route goes up to someone and straight back down through the same marriage
 * (the shared parents of two siblings, the shared grandparents of two
 * cousins), that person's spouse from the marriage joins them at the top,
 * and the line down comes from the couple, the way a family tree draws it.
 */
export function buildRelationshipChart(data: FamilyData, path: PathStep[]): { nodes: ChartNode[]; links: ChartLink[] } {
  const marriageById = new Map(data.marriages.map((m) => [m.id, m]));
  const nodes: ChartNode[] = [];
  const links: ChartLink[] = [];
  const coupleOf = new Map<ID, ID[]>();

  let col = 0;
  let row = 0;
  path.forEach((step, i) => {
    if (step.link === 'parent') row -= 1;
    if (step.link === 'child') row += 1;
    nodes.push({ personId: step.personId, col: col++, row, onPath: true, step: i > 0 ? step : undefined, prevPersonId: path[i - 1]?.personId });

    const next = path[i + 1];
    if (step.link === 'parent' && next?.link === 'child' && next.marriageId === step.marriageId && step.marriageId) {
      const marriage = marriageById.get(step.marriageId);
      const spouse = marriage?.spouseIds.find((id) => id !== step.personId);
      if (spouse && !path.some((s) => s.personId === spouse)) {
        nodes.push({ personId: spouse, col: col++, row, onPath: false });
        links.push({ kind: 'marriage', a: step.personId, b: spouse });
        coupleOf.set(step.personId, [step.personId, spouse]);
      }
    }
  });

  path.forEach((step, i) => {
    if (i === 0) return;
    const prevId = path[i - 1].personId;
    if (step.link === 'spouse') links.push({ kind: 'marriage', a: prevId, b: step.personId });
    if (step.link === 'parent') links.push({ kind: 'descent', parents: coupleOf.get(step.personId) ?? [step.personId], child: prevId });
    if (step.link === 'child') links.push({ kind: 'descent', parents: coupleOf.get(prevId) ?? [prevId], child: step.personId });
  });

  const minRow = Math.min(...nodes.map((n) => n.row));
  return { nodes: nodes.map((n) => ({ ...n, row: n.row - minRow })), links };
}
