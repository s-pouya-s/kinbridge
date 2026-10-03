import type { Person } from '../types';

/** Passed away: marked as deceased, or has a death date (older data only ever had the date). */
export function isDeceased(person: Person): boolean {
  return !!person.deceased || !!person.died;
}

/** "Name (nickname)": what a card and a list show. A placeholder shows `unknownLabel`. */
export function shortName(person: Pick<Person, 'name' | 'nickname' | 'unknown'>, unknownLabel: string): string {
  if (person.unknown) return unknownLabel;
  return person.nickname?.trim() ? `${person.name} (${person.nickname.trim()})` : person.name;
}

/** "Name surname (nickname)": titles, the info sheet and the PDF table. */
export function fullName(person: Pick<Person, 'name' | 'surname' | 'nickname' | 'unknown'>, unknownLabel: string): string {
  if (person.unknown) return unknownLabel;
  const name = [person.name, person.surname].filter(Boolean).join(' ');
  return person.nickname?.trim() ? `${name} (${person.nickname.trim()})` : name;
}
