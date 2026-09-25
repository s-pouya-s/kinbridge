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
 * otherwise by birth date.
 */
export function orderedChildIds(marriage: Marriage, peopleById: Map<ID, Person>): ID[] {
  return marriage.manualChildOrder ? marriage.childIds.slice() : marriage.childIds.slice().sort(byBirth(peopleById));
}
