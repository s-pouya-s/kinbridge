import type { Person } from '../types';

/** Passed away: marked as deceased, or has a death date (older data only ever had the date). */
export function isDeceased(person: Person): boolean {
  return !!person.deceased || !!person.died;
}
