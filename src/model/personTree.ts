import type { FamilyData, ID } from '../types';

/**
 * One person's own family tree, as a smaller FamilyData the normal tree
 * layout can draw as-is: the person, every recorded ancestor (parents,
 * their parents, and so on up), and every recorded descendant (children,
 * grandchildren, and so on down), plus the husband or wife in each of those
 * descendant couples, so every child still hangs from their two parents'
 * marriage the way the main tree draws it. Siblings, cousins, aunts and
 * uncles are left out: each ancestor couple keeps only the one child on
 * this person's own line.
 */
export function personTreeData(data: FamilyData, personId: ID): FamilyData {
  const parentMarriageOf = new Map<ID, (typeof data.marriages)[number]>();
  for (const m of data.marriages) for (const c of m.childIds) parentMarriageOf.set(c, m);

  const keep = new Set<ID>([personId]);

  // Up: both parents of everyone on the way, as far as they're recorded.
  const up = [personId];
  while (up.length > 0) {
    const m = parentMarriageOf.get(up.pop()!);
    if (!m) continue;
    for (const parent of m.spouseIds) {
      if (!keep.has(parent)) {
        keep.add(parent);
        up.push(parent);
      }
    }
  }
  const ancestors = new Set(keep);

  // Down: every marriage of the person and each descendant brings in the
  // spouse and all their children.
  const down = [personId];
  const descendants = new Set<ID>([personId]);
  while (down.length > 0) {
    const id = down.pop()!;
    for (const m of data.marriages) {
      if (!m.spouseIds.includes(id)) continue;
      for (const spouse of m.spouseIds) keep.add(spouse);
      for (const child of m.childIds) {
        if (!descendants.has(child)) {
          descendants.add(child);
          keep.add(child);
          down.push(child);
        }
      }
    }
  }

  const marriages = data.marriages
    .filter((m) => m.spouseIds.every((id) => keep.has(id)))
    .map((m) => {
      // A marriage between the person or a descendant and their spouse keeps
      // all its children; an ancestor couple keeps only the child on this
      // person's own line (the rest are siblings, aunts and uncles).
      const isDescendantMarriage = m.spouseIds.some((id) => descendants.has(id));
      const childIds = m.childIds.filter((c) => (isDescendantMarriage ? descendants.has(c) : ancestors.has(c)));
      return childIds.length === m.childIds.length ? m : { ...m, childIds };
    });

  // Rows count from this person, not from each family's oldest recorded
  // ancestor the way the main tree does: parents one row up, grandparents
  // two, whichever side they're on, so a mother whose family has fewer
  // recorded generations still sits level with the father. Pinned through
  // manualGeneration on this copy only. Longest distance wins, so a parent
  // always stays above their child even if two lines of descent meet.
  const upDistance = new Map<ID, number>([[personId, 0]]);
  const climb = [personId];
  while (climb.length > 0) {
    const id = climb.pop()!;
    const m = parentMarriageOf.get(id);
    if (!m || !m.spouseIds.every((p) => keep.has(p))) continue;
    for (const parent of m.spouseIds) {
      const d = upDistance.get(id)! + 1;
      if (d > (upDistance.get(parent) ?? -1)) {
        upDistance.set(parent, d);
        climb.push(parent);
      }
    }
  }
  const top = Math.max(...upDistance.values());
  const row = new Map<ID, number>();
  for (const [id, d] of upDistance) row.set(id, top - d);
  const descend = [personId];
  while (descend.length > 0) {
    const id = descend.pop()!;
    for (const m of marriages) {
      if (!m.spouseIds.includes(id)) continue;
      const r = row.get(id)!;
      // A descendant's husband or wife sits beside them.
      for (const spouse of m.spouseIds) if (!row.has(spouse)) row.set(spouse, r);
      for (const child of m.childIds) {
        if (descendants.has(child) && (row.get(child) ?? -1) < r + 1) {
          row.set(child, r + 1);
          descend.push(child);
        }
      }
    }
  }

  return {
    people: data.people.filter((p) => keep.has(p.id)).map((p) => ({ ...p, manualGeneration: row.get(p.id) ?? p.manualGeneration })),
    marriages,
  };
}
