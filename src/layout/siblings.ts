import type { ID, Marriage, Person } from '../types';

/**
 * Oldest first. born is a "YYYY-MM-DD" ISO string, which sorts correctly
 * lexicographically, so there's no need to parse it; unknown birth dates
 * sort last, keeping the order they were added in (Array.sort is stable).
 */
export function byBirth(peopleById: Map<ID, Person>) {
  return (a: ID, b: ID) => (peopleById.get(a)?.born ?? '9999-99-99').localeCompare(peopleById.get(b)?.born ?? '9999-99-99');
}

/**
 * A marriage's children in sibling order: exactly as childIds lists them
 * once someone has ordered them by hand (Marriage.manualChildOrder),
 * otherwise by birth date. Children born together always end up side by
 * side (see keepBornTogether).
 */
export function orderedChildIds(marriage: Marriage, peopleById: Map<ID, Person>): ID[] {
  const order = marriage.manualChildOrder ? marriage.childIds.slice() : marriage.childIds.slice().sort(byBirth(peopleById));
  return keepBornTogether(order, groupsOf(marriage));
}

/**
 * A marriage's groups of children born together, cleaned up: only its own
 * children, each child in one group at most, and only groups of two or more.
 */
export function groupsOf(marriage: Marriage): ID[][] {
  const seen = new Set<ID>();
  const groups: ID[][] = [];
  for (const group of marriage.multipleBirths ?? []) {
    const members = [...new Set(group)].filter((id) => marriage.childIds.includes(id) && !seen.has(id));
    if (members.length < 2) continue;
    members.forEach((id) => seen.add(id));
    groups.push(members);
  }
  return groups;
}

/** The others born together with this person (their twins, triplets, ...), or none. */
export function bornTogetherWith(marriages: Marriage[], personId: ID): ID[] {
  for (const m of marriages) {
    if (!m.childIds.includes(personId)) continue;
    const group = groupsOf(m).find((g) => g.includes(personId));
    return group ? group.filter((id) => id !== personId) : [];
  }
  return [];
}

/** `order` with each group's members moved right after its first member, keeping their relative order. */
export function keepBornTogether(order: ID[], groups: ID[][]): ID[] {
  if (groups.length === 0) return order;
  const groupOf = new Map<ID, ID[]>();
  for (const g of groups) for (const id of g) groupOf.set(id, g);
  const out: ID[] = [];
  const placed = new Set<ID>();
  for (const id of order) {
    if (placed.has(id)) continue;
    const group = groupOf.get(id);
    const run = group ? order.filter((x) => group.includes(x)) : [id];
    for (const x of run) {
      out.push(x);
      placed.add(x);
    }
  }
  return out;
}
