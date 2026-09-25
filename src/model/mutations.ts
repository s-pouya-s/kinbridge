import { orderedChildIds } from '../layout/siblings';
import type { FamilyData, ID, Marriage, Person } from '../types';
import { computeGenerations } from '../layout/generations';
import { computeRowOrder } from '../layout/order';
import { computeParentChildLayout } from '../layout/parentChildLayout';

export function newId(prefix: string): ID {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * What a newly added person is called, in the app's current language:
 * "New person" in English, «فرد جدید» in Persian. Mutations stay free of the
 * i18n layer, so the app hands this in; left out, it's English.
 */
export interface NewPersonName {
  label: string;
  /** Turns the running number into digits for this language (Persian uses ۰-۹). */
  formatNumber?: (n: number) => string;
}
const ENGLISH_NEW_PERSON: NewPersonName = { label: 'New person' };

/** Every label a placeholder name has ever used, so numbering continues across a language switch. */
const PLACEHOLDER_NAME = /^(?:New person|فرد جدید) ([0-9۰-۹]+)$/;
const toAsciiDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

/** "New person 1", "New person 2", ... — never reused, even across sessions or after renames/deletes, since it's always one past the highest number already present in `people`, whichever language that name was made in. Keeps multiple not-yet-named cards from all reading as an identical, indistinguishable "New person". */
function nextBlankPersonNumber(people: Person[]): number {
  let max = 0;
  for (const p of people) {
    const match = PLACEHOLDER_NAME.exec(p.name ?? '');
    if (match) max = Math.max(max, Number(toAsciiDigits(match[1])));
  }
  return max + 1;
}

function blankPerson(people: Person[], naming: NewPersonName = ENGLISH_NEW_PERSON): Person {
  const n = nextBlankPersonNumber(people);
  return { id: newId('p'), name: `${naming.label} ${naming.formatNumber ? naming.formatNumber(n) : n}` };
}

/**
 * If personId's own row (generation) already has anyone manually
 * positioned (Person.manualOrder), gives them an explicit cell there too —
 * one past the highest one already in use. Without this, a newcomer with no
 * manualOrder of their own falls back to their array index within that
 * row's automatic construction order, which has nothing to do with
 * manualOrder's cell-number space and can easily coincide with an existing
 * one — landing two cards exactly on top of each other. computeLayout only
 * guarantees no overlap when a row is consistently either fully automatic
 * or fully manual; this is what keeps every mutation that can drop someone
 * new into an existing row (a new spouse/child/parent, an existing person
 * linked in, or a generation move) from silently breaking that for the row
 * they land in. A no-op if that row has no manual cells yet, or if
 * personId already has one of their own.
 */
function pinIntoManualRowIfNeeded(data: FamilyData, personId: ID): FamilyData {
  const generations = computeGenerations(data);
  const g = generations.get(personId);
  if (g == null) return data;
  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  if (peopleById.get(personId)?.manualOrder != null) return data;

  const row = computeRowOrder(data, generations).get(g) ?? [];
  const existingManualOrders = row
    .filter((id) => id !== personId)
    .map((id) => peopleById.get(id)?.manualOrder)
    .filter((v): v is number => v != null);
  if (existingManualOrders.length === 0) return data;

  const cell = Math.max(...existingManualOrders) + 1;
  return { ...data, people: data.people.map((p) => (p.id === personId ? { ...p, manualOrder: cell } : p)) };
}

export function addStandalonePerson(data: FamilyData, naming?: NewPersonName): { data: FamilyData; person: Person } {
  const person = blankPerson(data.people, naming);
  return { data: { ...data, people: [...data.people, person] }, person };
}

export function updatePerson(data: FamilyData, personId: ID, patch: Partial<Person>): FamilyData {
  return { ...data, people: data.people.map((p) => (p.id === personId ? { ...p, ...patch, id: p.id } : p)) };
}

/**
 * Deletes a person and cleans up every reference to them, so nothing is
 * ever left pointing at an id that no longer exists:
 *  - any marriage they were a spouse in is removed entirely (a marriage
 *    can't exist with only one spouse) — its children aren't deleted, they
 *    just lose that one parental link and become standalone, same as
 *    removeChildFromMarriage.
 *  - they're spliced out of any marriage's childIds they appeared in.
 * The caller is expected to confirm with the user first — this itself does
 * not ask, it just does the cascade.
 */
export function deletePerson(data: FamilyData, personId: ID): FamilyData {
  return {
    people: data.people.filter((p) => p.id !== personId),
    marriages: data.marriages
      .filter((m) => !m.spouseIds.includes(personId))
      .map((m) => (m.childIds.includes(personId) ? { ...m, childIds: m.childIds.filter((c) => c !== personId) } : m)),
  };
}

export function addSpouse(data: FamilyData, personId: ID, naming?: NewPersonName): { data: FamilyData; person: Person; marriage: Marriage } {
  const person = blankPerson(data.people, naming);
  const marriage: Marriage = { id: newId('m'), spouseIds: [personId, person.id], status: 'current', childIds: [] };
  const next = pinIntoManualRowIfNeeded({ ...data, people: [...data.people, person], marriages: [...data.marriages, marriage] }, person.id);
  return { data: next, person, marriage };
}

/**
 * Same idea as addSpouse, but marries personId to a person who already
 * exists in the tree instead of creating a new one — for a cousin marriage,
 * or two separately-started family trees turning out to meet at this couple.
 * The caller is responsible for only offering sensible candidates (not
 * personId themselves, say); this itself doesn't validate anything, same as
 * addSpouse doesn't.
 */
export function addExistingSpouse(data: FamilyData, personId: ID, existingSpouseId: ID): { data: FamilyData; marriage: Marriage } {
  const marriage: Marriage = { id: newId('m'), spouseIds: [personId, existingSpouseId], status: 'current', childIds: [] };
  const withMarriage = { ...data, marriages: [...data.marriages, marriage] };
  // Whichever of the two ends up on the "moving" side of any spouse-leveling
  // (see computeGenerations) is the one whose row could now have gained a
  // manual-positioning conflict — pinIntoManualRowIfNeeded is a no-op for
  // whichever one didn't actually change row, so it's safe to just check both.
  const next = pinIntoManualRowIfNeeded(pinIntoManualRowIfNeeded(withMarriage, personId), existingSpouseId);
  return { data: next, marriage };
}

/** True if this person is already recorded as a child of some marriage — a person can only have one set of parents, so this gates the "add parents" actions to at most once. */
export function hasParents(data: FamilyData, personId: ID): boolean {
  return data.marriages.some((m) => m.childIds.includes(personId));
}

/**
 * Creates two new blank people, married to each other, and adds childId as
 * their child from the outset — the "+ New parents" action for a person who
 * doesn't have any recorded yet. Same "create new" pattern as addSpouse and
 * addChild, just starting from the child's side of the relationship instead
 * of a parent's. The caller is responsible for only offering this when
 * !hasParents(data, childId) — same trust-the-caller convention as
 * addExistingSpouse/addExistingChild.
 */
export function addParents(data: FamilyData, childId: ID, naming?: NewPersonName): { data: FamilyData; parentA: Person; parentB: Person; marriage: Marriage } {
  const parentA = blankPerson(data.people, naming);
  const parentB = blankPerson([...data.people, parentA], naming);
  const marriage: Marriage = { id: newId('m'), spouseIds: [parentA.id, parentB.id], status: 'current', childIds: [childId] };
  const withParents = { ...data, people: [...data.people, parentA, parentB], marriages: [...data.marriages, marriage] };
  const next = pinIntoManualRowIfNeeded(pinIntoManualRowIfNeeded(withParents, parentA.id), parentB.id);
  return { data: next, parentA, parentB, marriage };
}

export function updateMarriage(data: FamilyData, marriageId: ID, patch: Partial<Omit<Marriage, 'id' | 'spouseIds' | 'childIds'>>): FamilyData {
  return { ...data, marriages: data.marriages.map((m) => (m.id === marriageId ? { ...m, ...patch } : m)) };
}

/** Safe because it's only allowed once the marriage has no children left. */
export function canDeleteMarriage(data: FamilyData, marriageId: ID): boolean {
  const m = data.marriages.find((mm) => mm.id === marriageId);
  return !!m && m.childIds.length === 0;
}

export function deleteMarriage(data: FamilyData, marriageId: ID): FamilyData {
  return { ...data, marriages: data.marriages.filter((m) => m.id !== marriageId) };
}

/** Defaults a new child's surname to their father's, if the marriage has one recorded. Left blank otherwise — never guessed from the mother. */
export function addChild(data: FamilyData, marriageId: ID, naming?: NewPersonName): { data: FamilyData; person: Person } {
  const marriage = data.marriages.find((m) => m.id === marriageId);
  const father = marriage && data.people.find((p) => marriage.spouseIds.includes(p.id) && p.gender === 'male');
  const person: Person = { ...blankPerson(data.people, naming), surname: father ? father.surname : undefined };
  const next = pinIntoManualRowIfNeeded(
    {
      ...data,
      people: [...data.people, person],
      marriages: data.marriages.map((m) => (m.id === marriageId ? { ...m, childIds: [...m.childIds, person.id] } : m)),
    },
    person.id
  );
  return { data: next, person };
}

/**
 * Same idea as addChild, but links a person who already exists in the tree
 * as a child of this marriage instead of creating a new one — e.g. a person
 * added earlier as a standalone root of their own branch turns out to be
 * this couple's child. A true no-op (same reference) if they're already a
 * child of this marriage — this never duplicates.
 */
export function addExistingChild(data: FamilyData, marriageId: ID, existingChildId: ID): FamilyData {
  const marriage = data.marriages.find((m) => m.id === marriageId);
  if (!marriage || marriage.childIds.includes(existingChildId)) return data;
  const next = {
    ...data,
    marriages: data.marriages.map((m) => (m.id === marriageId ? { ...m, childIds: [...m.childIds, existingChildId] } : m)),
  };
  return pinIntoManualRowIfNeeded(next, existingChildId);
}

/**
 * The on-canvas ‹ › arrows (edit mode). Think of a row as a strip of
 * numbered cells (Person.manualOrder — see layout.ts): this moves a person
 * exactly one cell earlier/later. If another person already occupies that
 * cell, the two swap. If nobody does, the person simply moves into it —
 * their old cell is left empty, which is what opens up breathing room. Both
 * cases are the same operation; there's no special-casing for the edge of a
 * row, because "the neighboring cell is empty" isn't a special case here.
 *
 * The first time a row is touched this way, its current automatic order is
 * snapshotted into explicit cell numbers 0..n-1 for everyone in it, so every
 * cell — including the one this move might open up — has an unambiguous
 * number to compare against.
 */
export function movePersonOneStep(data: FamilyData, personId: ID, direction: 'earlier' | 'later'): FamilyData {
  const generations = computeGenerations(data);
  const g = generations.get(personId);
  if (g == null) return data;
  const row = computeRowOrder(data, generations).get(g) ?? [];
  if (!row.includes(personId)) return data;

  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  const alreadyManual = row.every((id) => peopleById.get(id)?.manualOrder != null);
  const cellOf = new Map<ID, number>(row.map((id, i) => [id, alreadyManual ? peopleById.get(id)!.manualOrder! : i]));

  const myCell = cellOf.get(personId)!;
  const targetCell = direction === 'earlier' ? myCell - 1 : myCell + 1;
  const occupantId = row.find((id) => id !== personId && cellOf.get(id) === targetCell);
  if (occupantId) cellOf.set(occupantId, myCell);
  cellOf.set(personId, targetCell);

  return {
    ...data,
    people: data.people.map((p) => (cellOf.has(p.id) ? { ...p, manualOrder: cellOf.get(p.id) } : p)),
  };
}

/**
 * Clears any manual cell positions for every person in this person's row,
 * reverting it back to the automatic chronological/adjacency rules — the
 * escape hatch for when a drag or a run of ‹ › presses has left a row in a
 * state that no longer looks right, with no other way back to "let the
 * algorithm decide again."
 */
export function resetRowOrder(data: FamilyData, personId: ID): FamilyData {
  const generations = computeGenerations(data);
  const g = generations.get(personId);
  if (g == null) return data;
  const rowSet = new Set(computeRowOrder(data, generations).get(g) ?? []);
  return {
    ...data,
    people: data.people.map((p) => (rowSet.has(p.id) ? { ...p, manualOrder: undefined } : p)),
  };
}

/**
 * Moves a person's row (generation) up or down — see Person.manualGeneration.
 * Only takes effect for someone not already pinned lower by a blood parent;
 * 'up' beyond row 0 is a no-op (there's no row above the top). See
 * pinIntoManualRowIfNeeded for why this also has to check the row they land in.
 */
export function movePersonGeneration(data: FamilyData, personId: ID, direction: 'up' | 'down'): FamilyData {
  // The row this person is actually drawn on, not computeGenerations' idea
  // of it. The two differ whenever a couple's families have a different
  // number of recorded generations: computeGenerations pulls spouses level,
  // the tree doesn't. Starting from the wrong one moved someone two rows
  // for a single tap (a real, previously-shipped bug).
  const drawnRow = (d: FamilyData) => computeParentChildLayout(d).generationOf?.get(personId);
  const current = drawnRow(data);
  if (current == null) return data;
  const target = direction === 'up' ? current - 1 : current + 1;
  if (target < 0) return data;

  const withManual = (d: FamilyData, ids: ID[]): FamilyData => ({
    ...d,
    people: d.people.map((p) => (ids.includes(p.id) ? { ...p, manualGeneration: target } : p)),
  });
  // Moving just this person is enough for anyone the tree places by their
  // own family line. A spouse with no recorded parents is instead drawn on
  // their partner's row, so moving them on their own changes nothing on
  // screen; for them, the couple moves together. Each try is checked
  // against the real layout, and only one that lands exactly one row away
  // is kept. (Moving up past one's own parents is never possible, so that
  // just does nothing.)
  const spouseIds = data.marriages.filter((m) => m.spouseIds.includes(personId)).map((m) => m.spouseIds.find((id) => id !== personId)!);
  const attempts: ID[][] = [[personId], ...spouseIds.map((spouseId) => [personId, spouseId])];
  for (const ids of attempts) {
    const moved = withManual(data, ids);
    if (drawnRow(moved) === target) return ids.reduce((d, id) => pinIntoManualRowIfNeeded(d, id), moved);
  }
  return data;
}

/**
 * Puts a marriage's children in a hand-set order (dragged into place on the
 * marriage's edit form), oldest first, and from then on keeps that order
 * instead of sorting by birth date (Marriage.manualChildOrder). `ids` must be
 * exactly this marriage's children; anything else is ignored.
 */
export function setChildOrder(data: FamilyData, marriageId: ID, ids: ID[]): FamilyData {
  const marriage = data.marriages.find((m) => m.id === marriageId);
  if (!marriage || ids.length !== marriage.childIds.length || !ids.every((id) => marriage.childIds.includes(id))) return data;
  return { ...data, marriages: data.marriages.map((m) => (m.id === marriageId ? { ...m, childIds: ids.slice(), manualChildOrder: true } : m)) };
}

/** Goes back to sorting this marriage's children by birth date. */
export function resetChildOrder(data: FamilyData, marriageId: ID): FamilyData {
  return { ...data, marriages: data.marriages.map((m) => (m.id === marriageId ? { ...m, manualChildOrder: undefined } : m)) };
}

/** Detaches a child from a marriage without deleting them — they become a standalone person. */
export function removeChildFromMarriage(data: FamilyData, marriageId: ID, childId: ID): FamilyData {
  return {
    ...data,
    marriages: data.marriages.map((m) => (m.id === marriageId ? { ...m, childIds: m.childIds.filter((c) => c !== childId) } : m)),
  };
}
