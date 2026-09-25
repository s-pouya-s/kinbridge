import { orderedChildIds } from './siblings';
import type { FamilyData, ID, Marriage, Person } from '../types';

/**
 * Decides left-to-right order within each generation row.
 *
 * Children are laid out eldest-first (smallest canonical x — see layout.ts's
 * mirrorX for how that becomes "eldest on the right" once RTL-mirrored).
 * Marriages get the same chronological treatment: when a person has several
 * same-generation spouses, the earliest marriage sits immediately on their
 * canonical-left (visual right in RTL — the "1st marriage" position) and
 * later ones queue up on the other side, in order.
 *
 * That clustering happens at construction time (insertWithSpouses), not as
 * a later repair pass — a person with two same-row spouses (a divorce +
 * remarriage, say) needs both adjacent to them simultaneously, and a
 * pairwise "pull these two together" pass processed one marriage at a time
 * would satisfy the second marriage by breaking the first. Building the
 * cluster in one shot avoids that.
 *
 * `optimizeRowForAdjacency` still runs afterward for the case construction
 * can't see: same-generation marriages between people from *different*
 * parents (cousins), resolved with the minimum number of local swaps. When
 * `priorityPair` is given (the person just tapped, and their current
 * spouse), that pair is resolved last so nothing already placed for it gets
 * disturbed by another pair's swap.
 */
export function computeRowOrder(
  data: FamilyData,
  generations: Map<ID, number>,
  priorityPair?: [ID, ID]
): Map<number, ID[]> {
  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  const marriagesByPerson = new Map<ID, Marriage[]>();
  data.marriages.forEach((m) => {
    m.spouseIds.forEach((id) => {
      const arr = marriagesByPerson.get(id) ?? [];
      arr.push(m);
      marriagesByPerson.set(id, arr);
    });
  });

  const maxGen = Math.max(0, ...Array.from(generations.values()));
  const rows = new Map<number, ID[]>();

  for (let g = 0; g <= maxGen; g++) {
    const spousesByPerson = sameRowSpouses(data.marriages, generations, g);
    const thisRow: ID[] = [];
    const placed = new Set<ID>();

    if (g === 0) {
      for (const p of data.people) {
        if (generations.get(p.id) === 0) insertWithSpouses(p.id, thisRow, placed, spousesByPerson);
      }
    } else {
      const prevRow = rows.get(g - 1) ?? [];
      const emittedUnits = new Set<string>();
      for (const personId of prevRow) {
        for (const m of marriagesByPerson.get(personId) ?? []) {
          if (emittedUnits.has(m.id)) continue;
          emittedUnits.add(m.id);
          const children = orderedChildIds(m, peopleById).filter((cid) => generations.get(cid) === g);
          for (const cid of children) insertWithSpouses(cid, thisRow, placed, spousesByPerson);
        }
      }
      // Anyone in this generation who wasn't reached above (e.g. an unknown
      // spouse with no parent link of their own) is appended at the end.
      for (const p of data.people) {
        if (generations.get(p.id) === g) insertWithSpouses(p.id, thisRow, placed, spousesByPerson);
      }
    }

    rows.set(g, thisRow);
  }

  for (let g = 0; g <= maxGen; g++) {
    optimizeRowForAdjacency(rows.get(g)!, data.marriages, g, generations, priorityPair);
  }

  // Manual overrides (see Person.manualOrder) win last, over both the
  // chronological construction and the adjacency pass — someone who
  // deliberately dragged a card gets the final say.
  for (let g = 0; g <= maxGen; g++) {
    applyManualOrder(rows.get(g)!, peopleById);
  }

  return rows;
}

/**
 * Stable-sorts a row by Person.manualOrder where it's set, leaving anyone
 * without an override in their existing (automatically computed) relative
 * order — their effective key is just their current index, so a row with no
 * manual overrides at all is a no-op.
 */
function applyManualOrder(row: ID[], peopleById: Map<ID, Person>) {
  if (!row.some((id) => peopleById.get(id)?.manualOrder != null)) return;
  const keyed = row.map((id, i) => ({ id, key: peopleById.get(id)?.manualOrder ?? i }));
  keyed.sort((a, b) => a.key - b.key);
  row.splice(0, row.length, ...keyed.map((k) => k.id));
}

/** personId -> same-generation spouse ids, earliest marriage first. */
function sameRowSpouses(marriages: Marriage[], generations: Map<ID, number>, g: number): Map<ID, ID[]> {
  const relevant = marriages
    .filter((m) => generations.get(m.spouseIds[0]) === g && generations.get(m.spouseIds[1]) === g)
    .slice()
    .sort((a, b) => {
      const ay = a.marriedYear ?? Number.MAX_SAFE_INTEGER;
      const by = b.marriedYear ?? Number.MAX_SAFE_INTEGER;
      if (ay !== by) return ay - by;
      return a.id.localeCompare(b.id);
    });
  const result = new Map<ID, ID[]>();
  for (const m of relevant) {
    const [a, b] = m.spouseIds;
    result.set(a, [...(result.get(a) ?? []), b]);
    result.set(b, [...(result.get(b) ?? []), a]);
  }
  return result;
}

function insertWithSpouses(id: ID, row: ID[], placed: Set<ID>, spousesByPerson: Map<ID, ID[]>) {
  if (placed.has(id)) return;
  const spouses = (spousesByPerson.get(id) ?? []).filter((s) => !placed.has(s));

  if (spouses.length === 0) {
    row.push(id);
    placed.add(id);
    return;
  }
  if (spouses.length === 1) {
    // No chronological signal with just one marriage — keep it simple.
    row.push(id);
    placed.add(id);
    row.push(spouses[0]);
    placed.add(spouses[0]);
    return;
  }
  // Two or more: earliest marriage immediately before (canonical-left), the
  // rest queue up after, in chronological order.
  row.push(spouses[0]);
  placed.add(spouses[0]);
  row.push(id);
  placed.add(id);
  for (let i = 1; i < spouses.length; i++) {
    row.push(spouses[i]);
    placed.add(spouses[i]);
  }
}

function optimizeRowForAdjacency(
  row: ID[],
  marriages: Marriage[],
  g: number,
  generations: Map<ID, number>,
  priorityPair?: [ID, ID]
) {
  const isPriority = (pair: [ID, ID]) =>
    !!priorityPair &&
    ((pair[0] === priorityPair[0] && pair[1] === priorityPair[1]) ||
      (pair[0] === priorityPair[1] && pair[1] === priorityPair[0]));

  const sameGenPairs = marriages
    .filter((m) => generations.get(m.spouseIds[0]) === g && generations.get(m.spouseIds[1]) === g)
    .map((m) => m.spouseIds as [ID, ID])
    .sort((p1, p2) => Number(isPriority(p1)) - Number(isPriority(p2))); // priority pair resolved last

  for (const [a, b] of sameGenPairs) {
    let posA = row.indexOf(a);
    let posB = row.indexOf(b);
    if (posA === -1 || posB === -1) continue;
    while (Math.abs(posA - posB) > 1) {
      const step = posB > posA ? -1 : 1;
      const swapWith = posB + step;
      [row[posB], row[swapWith]] = [row[swapWith], row[posB]];
      posB = swapWith;
      posA = row.indexOf(a);
    }
  }
}
