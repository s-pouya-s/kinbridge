import type { FamilyData, ID } from '../types';

/** personId -> their direct blood children's ids, from every marriage's childIds. */
function buildChildrenMap(data: FamilyData): Map<ID, ID[]> {
  const childrenOf = new Map<ID, ID[]>();
  for (const m of data.marriages) {
    for (const parentId of m.spouseIds) {
      childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), ...m.childIds]);
    }
  }
  return childrenOf;
}

/** True if descendantId is reachable from ancestorId by walking blood-children links (any number of generations down). */
function isBloodAncestor(childrenOf: Map<ID, ID[]>, ancestorId: ID, descendantId: ID): boolean {
  const stack = [...(childrenOf.get(ancestorId) ?? [])];
  const seen = new Set<ID>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === descendantId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return false;
}

/**
 * Assigns every person a generation (row) number: 0 for the eldest recorded
 * ancestors, +1 per blood generation below them. Spouses are normally kept
 * level with their partner, even when they married in from outside the
 * blood line (an "unknown" ancestor, or someone with no recorded parents of
 * their own) — otherwise a couple would render on two different rows.
 *
 * Implemented as relaxation (repeatedly push generations up until nothing
 * changes) rather than a strict topological sort, because "keep spouses
 * level" and "child is one below its parents" can conflict transiently while
 * the tree is being resolved — relaxation converges to a fixed point either
 * way and comfortably handles the tree sizes a single family produces.
 *
 * The one pair "keep spouses level" is never applied to: a marriage between
 * a blood ancestor and their own blood descendant (a cousin-marriage chain
 * that loops back on itself several generations later). Leveling that pair
 * would cascade back through the very descent chain that connects them —
 * pulling the ancestor up pulls their descendants up, which pulls the
 * descendant-spouse up, which pulls the ancestor up again — growing without
 * bound instead of settling. Each side just keeps its own blood-driven row
 * instead; the marriage bar ends up spanning multiple rows, which is a far
 * smaller problem than a runaway generation count breaking the whole layout.
 *
 * A person with Person.manualGeneration seeds from that row instead of 0 —
 * used to align an unconnected second family's root with the right
 * generation of the first. It's only a starting point, not a floor or
 * ceiling: relaxation can still push it higher (a manually-seeded person
 * can never end up above their own blood parents), it just never starts
 * anyone below row 0.
 */
export function computeGenerations(data: FamilyData): Map<ID, number> {
  const gen = new Map<ID, number>();
  data.people.forEach((p) => gen.set(p.id, Math.max(0, p.manualGeneration ?? 0)));

  const childrenOf = buildChildrenMap(data);
  const skipLeveling = data.marriages.map(
    (m) => isBloodAncestor(childrenOf, m.spouseIds[0], m.spouseIds[1]) || isBloodAncestor(childrenOf, m.spouseIds[1], m.spouseIds[0])
  );

  const maxIterations = data.people.length + data.marriages.length + 5;
  for (let i = 0; i < maxIterations; i++) {
    let changed = false;

    data.marriages.forEach((m, idx) => {
      const [a, b] = m.spouseIds;
      if (!skipLeveling[idx]) {
        const ga = gen.get(a) ?? 0;
        const gb = gen.get(b) ?? 0;
        if (ga !== gb) {
          const g = Math.max(ga, gb);
          gen.set(a, g);
          gen.set(b, g);
          changed = true;
        }
      }
      const parentGen = Math.max(gen.get(a) ?? 0, gen.get(b) ?? 0);
      for (const childId of m.childIds) {
        const childGen = gen.get(childId) ?? 0;
        if (childGen < parentGen + 1) {
          gen.set(childId, parentGen + 1);
          changed = true;
        }
      }
    });

    if (!changed) break;
  }

  return gen;
}
