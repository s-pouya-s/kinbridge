import type { FamilyData } from '../types';

/**
 * born/died used to be a plain year (number) before dates got a real Shamsi
 * picker; anything already saved to a device or sitting in an old export
 * still has that shape. Both load paths in storage.ts run through here so
 * stale data never reaches the rest of the app — the layout's date sort in
 * particular assumes an ISO string and throws on a bare number.
 *
 * Kept dependency-free (no AsyncStorage/expo-file-system imports) so it can
 * be unit-tested with plain objects outside the RN runtime.
 */
/**
 * An earlier bug in computeGenerations (a marriage between a blood ancestor
 * and their own descendant looped generation numbers up without bound
 * instead of settling) could get a wildly inflated Person.manualGeneration
 * — set by the ▲▼ arrows, which seed from whatever computeGenerations
 * currently reports — permanently written to storage. That bug is fixed,
 * but data already saved with a bogus value like 145 stays broken forever
 * without this: no real family tree has more generations than it has
 * people, so anything past that count clearly isn't a real generation and
 * is dropped back to "let the algorithm decide" rather than kept as a
 * seed that reproduces the same runaway-looking layout.
 */
function clampManualGeneration(data: FamilyData): FamilyData {
  const maxSaneGeneration = data.people.length;
  return {
    ...data,
    people: data.people.map((p) =>
      p.manualGeneration != null && p.manualGeneration > maxSaneGeneration ? { ...p, manualGeneration: undefined } : p
    ),
  };
}

/**
 * A marriage that names someone who isn't in `people` (a hand-edited or
 * half-broken file; the app's own built-in sample family once did exactly
 * this) drew a ⊕ with lines to children who never appeared. Children that
 * don't exist are dropped from their marriage, and a marriage missing one
 * of its two spouses is dropped altogether.
 */
function dropDanglingLinks(data: FamilyData): FamilyData {
  const ids = new Set(data.people.map((p) => p.id));
  const marriages = data.marriages
    .filter((m) => m.spouseIds.every((id) => ids.has(id)))
    .map((m) => (m.childIds.every((id) => ids.has(id)) ? m : { ...m, childIds: m.childIds.filter((id) => ids.has(id)) }));
  const unchanged = marriages.length === data.marriages.length && marriages.every((m, i) => m === data.marriages[i]);
  return unchanged ? data : { ...data, marriages };
}

export function normalizeFamilyData(data: FamilyData): FamilyData {
  return clampManualGeneration({
    ...dropDanglingLinks(data),
    people: data.people.map((p) => {
      const born = typeof p.born === 'number' ? `${p.born}-01-01` : p.born;
      const died = typeof p.died === 'number' ? `${p.died}-01-01` : p.died;
      return born === p.born && died === p.died ? p : { ...p, born, died };
    }),
  });
}
