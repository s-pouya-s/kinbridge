import { computeParentChildLayout, FAMILY_GAP, ROOT_FAMILY_GAP } from '../../src/layout/parentChildLayout';
import { personTreeData } from '../../src/model/personTree';
import { CARD_METRICS, cardSize, type CardStyle } from '../../src/layout/layout';
import { makeUnionRouter, segmentCrossesBox as crossesBox } from '../../src/layout/routes';
import type { FamilyData, ID } from '../../src/types';
import { cardText, MIN_NAME_SIZE, textWidth } from '../../src/components/cardText';
import { shortName } from '../../src/model/people';
import { groupsOf } from '../../src/layout/siblings';

type P = { x: number; y: number };

/**
 * Every rule a laid-out family must follow (see AGENTS.md, "Tree layout").
 * Returns one line per problem found; an empty list means the family passes.
 */
export interface RuleOptions {
  /** Empty cells between separate founding families (the layout option of the same name). */
  rootFamilyGap?: number;
  /** Children of one couple always share a row (the one-person view, which never lowers anyone by hand). */
  siblingsOnOneRow?: boolean;
}

export function familyProblems(data: FamilyData, options: RuleOptions = {}): string[] {
  const rootGap = options.rootFamilyGap ?? ROOT_FAMILY_GAP;
  const problems: string[] = [];
  const name = (id: ID) => data.people.find((p) => p.id === id)?.name ?? id;
  const hasParents = new Map<ID, ID[]>();
  for (const m of data.marriages) for (const c of m.childIds) hasParents.set(c, m.spouseIds);
  const marriageCount = new Map<ID, number>();
  for (const m of data.marriages) for (const id of m.spouseIds) marriageCount.set(id, (marriageCount.get(id) ?? 0) + 1);

  // Founding families: people with no parents, grouped with any spouse who
  // also has none. Each person's set is the families they descend from.
  const spousesOf = new Map<ID, ID[]>();
  for (const m of data.marriages) for (const [x, y] of [m.spouseIds, [m.spouseIds[1], m.spouseIds[0]]]) spousesOf.set(x, [...(spousesOf.get(x) ?? []), y]);
  const unitOf = new Map<ID, ID>();
  for (const p of data.people) {
    if (hasParents.has(p.id) || unitOf.has(p.id)) continue;
    const stack = [p.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (unitOf.has(id)) continue;
      unitOf.set(id, p.id);
      for (const s of spousesOf.get(id) ?? []) if (!hasParents.has(s)) stack.push(s);
    }
  }
  const foundersCache = new Map<ID, Set<ID>>();
  const foundersOf = (id: ID): Set<ID> => {
    const cached = foundersCache.get(id);
    if (cached) return cached;
    const out = new Set<ID>();
    foundersCache.set(id, out);
    const parents = hasParents.get(id);
    if (parents) parents.forEach((p) => foundersOf(p).forEach((f) => out.add(f)));
    else if ((spousesOf.get(id) ?? []).some((s) => !hasParents.has(s)) || !spousesOf.has(id)) out.add(unitOf.get(id)!);
    else (spousesOf.get(id) ?? []).forEach((s) => foundersOf(s).forEach((f) => out.add(f)));
    return out;
  };

  for (const style of ['compact', 'large'] as CardStyle[]) {
    const metrics = CARD_METRICS[style];
    const layout = computeParentChildLayout(data, metrics, { rootFamilyGap: rootGap });
    const col = metrics.colSpacing;
    const pos = (id: ID) => layout.positions.get(id)!;
    const say = (msg: string) => problems.push(`[${style}] ${msg}`);

    // Everyone is drawn.
    const missing = data.people.filter((p) => !layout.positions.has(p.id));
    if (missing.length > 0) say(`not drawn: ${missing.map((p) => p.name).join(', ')}`);

    // No two cards in one cell, and cards only on whole cells.
    const rows = new Map<number, { id: ID; x: number }[]>();
    layout.positions.forEach((p, id) => {
      if (Math.abs(p.x / col - Math.round(p.x / col)) > 1e-9) say(`${name(id)} is not on a whole cell`);
      rows.set(p.y, [...(rows.get(p.y) ?? []), { id, x: p.x }]);
    });
    rows.forEach((row) => {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) {
        if (row[i].x - row[i - 1].x < col) say(`cards overlap: ${name(row[i - 1].id)} and ${name(row[i].id)}`);
      }
    });

    // A child is always drawn below both parents.
    for (const m of data.marriages) {
      for (const c of m.childIds) {
        const pc = layout.positions.get(c);
        if (!pc) continue;
        for (const s of m.spouseIds) {
          const ps = layout.positions.get(s);
          if (ps && pc.y <= ps.y) say(`${name(c)} is not below their parent ${name(s)}`);
        }
      }
    }

    // No line ever crosses a card (other than the cards it connects).
    const { width: w, height: h } = cardSize(layout.maxGen, metrics);
    const route = makeUnionRouter(layout, h);
    const inset = 0.5;
    const cards = Array.from(layout.positions, ([id, p]) => ({ id, x0: p.x - w / 2 + inset, y0: p.y - h / 2 + inset, x1: p.x + w / 2 - inset, y1: p.y + h / 2 - inset }));
    for (const u of layout.unions) {
      const r = route(u);
      if (!r) continue;
      const lines: { points: P[]; own: ID[]; what: string }[] = [
        { points: r.spouses[0], own: [u.marriage.spouseIds[0]], what: `line from ${name(u.marriage.spouseIds[0])} to their marriage` },
        { points: r.spouses[1], own: [u.marriage.spouseIds[1]], what: `line from ${name(u.marriage.spouseIds[1])} to their marriage` },
        ...r.children.map((c) => ({ points: c.points, own: [c.childId], what: `line to child ${name(c.childId)}` })),
        ...r.trunks.map((tr) => ({ points: tr.points, own: [] as ID[], what: `shared line to ${tr.childIds.map(name).join(', ')}` })),
      ];
      for (const line of lines) {
        for (let i = 1; i < line.points.length; i++) {
          const a = line.points[i - 1];
          const b = line.points[i];
          for (const card of cards) {
            if (line.own.includes(card.id)) continue;
            if (card.x1 < Math.min(a.x, b.x) || card.x0 > Math.max(a.x, b.x) || card.y1 < Math.min(a.y, b.y) || card.y0 > Math.max(a.y, b.y)) continue;
            if (crossesBox(a, b, card.x0, card.y0, card.x1, card.y1)) say(`${line.what} crosses ${name(card.id)}'s card`);
          }
        }
      }
    }

    // Card text never goes past the card's edge, never under the minimum
    // size, and a cut name is the start of the real one, ending in "…".
    const growth = cardSize(layout.maxGen, metrics).growth;
    const maxSize = (st: CardStyle, photo: boolean, unknown: boolean) => (st === 'compact' ? 22 : photo ? 26 : 40) * (unknown ? 0.8 : 1) + growth * 0.75 * (unknown ? 0.8 : 1);
    for (const person of data.people) {
      const text = cardText(person, 'Unknown', style, w, h, metrics.nodeHeight, cardSize(layout.maxGen, metrics).growth);
      const lines = [
        { line: text.name, full: shortName(person, 'Unknown'), min: MIN_NAME_SIZE[style], max: maxSize(style, text.showPhoto, !!person.unknown) },
        ...(text.surname ? [{ line: text.surname, full: person.surname!, min: MIN_NAME_SIZE[style] * 0.8, max: maxSize(style, text.showPhoto, false) * 0.7 }] : []),
      ];
      for (const { line, full, min, max } of lines) {
        if (textWidth(line.text, line.fontSize) > text.maxTextWidth + 0.01) say(`"${line.text}" is wider than ${name(person.id)}'s card`);
        if (line.fontSize < min - 0.01) say(`${name(person.id)}'s text is smaller than the minimum (${line.fontSize.toFixed(1)})`);
        if (line.text !== full && !(line.text.endsWith('…') && full.startsWith(line.text.slice(0, -1).trimEnd()))) say(`"${line.text}" is not a cut of "${full}"`);
        // Cut only when the whole name doesn't fit even at the minimum size.
        if (line.text !== full && textWidth(full, min) <= text.maxTextWidth) say(`"${full}" was cut though it fits at the minimum size`);
        // A name shrunk below its maximum uses the card's whole width.
        if (line.text === full && line.fontSize < max - 0.01 && textWidth(full, line.fontSize) < text.maxTextWidth * 0.98) say(`"${full}" is smaller than it needs to be`);
      }
      const lineHeight = (size: number) => size * 1.35;
      const used =
        style === 'large'
          ? (text.showPhoto ? 14 + text.photoSize + 10 : 0) + lineHeight(text.name.fontSize) + (text.surname ? 1 + lineHeight(text.surname.fontSize) : 0)
          : Math.max(text.showPhoto ? text.photoSize : 0, lineHeight(text.name.fontSize));
      if (used > h) say(`${name(person.id)}'s card text is taller than the card`);
    }

    // Children born together sit side by side: no brother or sister of
    // theirs between them on their row.
    for (const m of data.marriages) {
      for (const group of groupsOf(m)) {
        const at = group.map((id) => layout.positions.get(id)).filter((p): p is P => !!p);
        if (at.length < 2 || new Set(at.map((p) => p.y)).size > 1) continue;
        const lo = Math.min(...at.map((p) => p.x));
        const hi = Math.max(...at.map((p) => p.x));
        const between = m.childIds.filter((c) => !group.includes(c) && layout.positions.get(c)?.y === at[0].y && layout.positions.get(c)!.x > lo && layout.positions.get(c)!.x < hi);
        if (between.length > 0) say(`${between.map(name).join(', ')} sits between ${group.map(name).join(', ')}, who were born together`);
      }
    }

    // Only one marker per spot.
    const markerSpots = new Set<string>();
    for (const u of layout.unions) {
      const key = `${u.markerX},${u.markerY}`;
      if (markerSpots.has(key)) say(`two marriage markers on one spot (${u.marriage.id})`);
      markerSpots.add(key);
    }

    if (style !== 'compact') continue;

    // A spouse with no parents, in their only marriage, to a partner with
    // only that marriage, sits right beside them.
    for (const m of data.marriages) {
      const [a, b] = m.spouseIds;
      const outsider = !hasParents.has(a) && hasParents.has(b) ? a : !hasParents.has(b) && hasParents.has(a) ? b : null;
      if (!outsider || marriageCount.get(outsider) !== 1) continue;
      const partner = outsider === a ? b : a;
      if (marriageCount.get(partner) !== 1) continue;
      const gap = Math.abs(pos(outsider).x - pos(partner).x) / col;
      if (gap !== 1 || pos(outsider).y !== pos(partner).y) say(`${name(outsider)} is ${gap} cells from their spouse ${name(partner)}, not right beside them`);
    }

    if (options.siblingsOnOneRow) {
      for (const m of data.marriages) {
        if (new Set(m.childIds.map((c) => layout.positions.get(c)?.y)).size > 1) say(`children of ${m.spouseIds.map(name).join(' and ')} are on different rows`);
      }
    }

    // Two separate founding families keep at least rootGap empty cells between
    // them on every row. A founding family is founders married to each
    // other; everyone belongs to the families of their founders (several,
    // when two families married into each other), and someone who married
    // in belongs to their partner's.
    rows.forEach((row) => {
      for (let i = 1; i < row.length; i++) {
        const left = foundersOf(row[i - 1].id);
        const right = foundersOf(row[i].id);
        if (left.size && right.size && ![...left].some((f) => right.has(f)) && row[i].x - row[i - 1].x < (rootGap + 1) * col) {
          say(`separate families too close: ${name(row[i - 1].id)} and ${name(row[i].id)} have ${(row[i].x - row[i - 1].x) / col - 1} empty cells between them`);
        }
      }
    });

    // Children of two couples who share no parent never sit side by side.
    rows.forEach((row) => {
      for (let i = 1; i < row.length; i++) {
        const left = hasParents.get(row[i - 1].id);
        const right = hasParents.get(row[i].id);
        if (left && right && !left.some((id) => right.includes(id)) && row[i].x - row[i - 1].x === col) {
          say(`cousins touch with no gap: ${name(row[i - 1].id)} and ${name(row[i].id)}`);
        }
      }
    });
  }
  return problems;
}

/** Every rule, for the one-person view of `personId` (see personTreeData and PersonTreeView). */
export function personTreeProblems(data: FamilyData, personId: ID): string[] {
  return familyProblems(personTreeData(data, personId), { rootFamilyGap: FAMILY_GAP, siblingsOnOneRow: true }).map((p) => `[tree of ${data.people.find((q) => q.id === personId)?.name ?? personId}] ${p}`);
}
