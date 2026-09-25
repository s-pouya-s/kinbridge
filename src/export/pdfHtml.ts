import type { FamilyData, ID, Person } from '../types';
import type { TFunction } from '../i18n';
import type { Theme } from '../theme';
import { COMPACT_METRICS, GENERATION_GROWTH_CAP, mirrorX } from '../layout/layout';
import { computeParentChildLayout } from '../layout/parentChildLayout';
import { isDeceased } from '../model/people';
import { isoToJalali, toPersianDigits } from '../utils/jalali';

/** Room around the tree inside the drawing, as on the canvas (see TreeCanvas's CANVAS_PADDING). */
const PAD = 80;
/** The ⊕ on paper; smaller than the on-screen tap target, which needs to fit a finger. */
const MARKER_R = 14;

const FONT_STACK = "'Vazirmatn', 'Noto Naskh Arabic', 'Noto Sans Arabic', Tahoma, sans-serif";
/** A4 landscape is 297 × 210 mm; this much is left blank all round for the printer. */
const PAGE_MARGIN_MM = 10;
/** The header strip at the top of each tree page: name, part number, where it goes. */
const HEADER_MM = 14;
/** The tree area on each page: all of it below the header. */
const TILE_MM = { width: 297 - PAGE_MARGIN_MM * 2, height: 210 - PAGE_MARGIN_MM * 2 - HEADER_MM };
/**
 * The poster's scale: millimeters of paper per unit of the tree drawing. A
 * card (about 170 units) prints about 3.4 cm wide and a name about 10 pt,
 * readable when the parts are laid out on a table or a wall.
 */
const POSTER_MM_PER_UNIT = 0.2;

export interface PdfOptions {
  treeName: string;
  isRTL: boolean;
  locale: 'fa' | 'en';
  t: TFunction;
  /** Always the light theme: a PDF is for paper. */
  colors: Theme;
  showRibbon: boolean;
  exportedAt: Date;
}

/**
 * One family tree as a printable HTML document, for expo-print to turn into
 * a PDF (see exportTreePdf). Page one is the whole tree, drawn the way the
 * app draws it (the same layout, gender colors, marriage lines and ⊕
 * markers, and the mourning ribbon when that setting is on), scaled to fit
 * one page: vector, so it can be zoomed into in any PDF viewer without going
 * blurry. Then the same tree at a readable size, split across as many pages
 * as it needs, which printed and laid side by side rebuild the whole tree
 * (see the poster below). Last, a table of everyone with their dates,
 * places, parents and spouses.
 *
 * Pure (no React Native), so scripts can render it in a desktop browser to
 * check how it looks.
 */
export function buildTreePdfHtml(data: FamilyData, options: PdfOptions): string {
  const { t, isRTL, colors } = options;
  const layout = computeParentChildLayout(data, COMPACT_METRICS);
  const byId = new Map(data.people.map((p) => [p.id, p]));

  const growth = Math.min(layout.maxGen, GENERATION_GROWTH_CAP);
  const cardW = Math.min(COMPACT_METRICS.nodeWidth + growth * 2, COMPACT_METRICS.colSpacing - 12);
  const cardH = COMPACT_METRICS.nodeHeight + growth * COMPACT_METRICS.heightGrowthPerGen;
  const width = layout.width + PAD * 2;
  // Card centers sit at their row's y, so the top row needs half a card of room above it.
  const height = layout.height + PAD * 2 + cardH / 2;
  // Same mapping as TreeCanvas's toCanvas: mirrored for RTL, shifted past the tree's own left edge.
  const at = (p: { x: number; y: number }) => ({
    x: (isRTL ? mirrorX(p.x, layout.minX, layout.maxX) : p.x) - layout.minX + PAD + COMPACT_METRICS.colSpacing / 2,
    y: p.y + PAD,
  });

  const digits = (n: number | string) => (options.locale === 'fa' ? toPersianDigits(n) : String(n));
  const year = (iso?: string) => {
    const d = isoToJalali(iso);
    return d ? digits(d.jy) : undefined;
  };
  const date = (iso?: string) => {
    const d = isoToJalali(iso);
    return d ? digits(`${d.jy}/${d.jm}/${d.jd}`) : '';
  };
  const nameOf = (p?: Person) => (!p ? '' : p.unknown ? t('unknown') : [p.name, p.surname].filter(Boolean).join(' '));
  const firstNameOf = (p?: Person) => (!p ? '' : p.unknown ? t('unknown') : p.name);
  const lifeSpan = (p: Person) => {
    if (p.unknown) return '';
    const born = year(p.born) ?? '?';
    if (!isDeceased(p)) return born;
    return `${born} – ${year(p.died) ?? '?'}`;
  };
  const cardColors = (p: Person) =>
    p.unknown
      ? { fill: colors.panel2, stroke: colors.inkFaint }
      : p.gender === 'male'
        ? { fill: colors.maleFill, stroke: colors.maleStroke }
        : p.gender === 'female'
          ? { fill: colors.femaleFill, stroke: colors.femaleStroke }
          : { fill: colors.nodeFill, stroke: colors.nodeStroke };

  // Everything drawn, as rough bounding boxes, so a poster part with
  // nothing in it can be left out (see below).
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const addBox = (xa: number, ya: number, xb: number, yb: number, grow = 0) =>
    boxes.push({ x0: Math.min(xa, xb) - grow, y0: Math.min(ya, yb) - grow, x1: Math.max(xa, xb) + grow, y1: Math.max(ya, yb) + grow });

  // Lines first, so cards and markers sit on top of them.
  const lines: string[] = [];
  const markers: string[] = [];
  for (const u of layout.unions) {
    const pa = layout.positions.get(u.marriage.spouseIds[0]);
    const pb = layout.positions.get(u.marriage.spouseIds[1]);
    if (!pa || !pb) continue;
    const a = at(pa);
    const b = at(pb);
    const m = at({ x: u.markerX, y: u.markerY });
    const barY = m.y;
    const color = u.marriage.status === 'current' ? colors.lineMarriage : colors.lineEnded;
    const dash = u.marriage.status === 'ended' ? ' stroke-dasharray="6 5"' : '';
    lines.push(
      `<path d="M${a.x} ${a.y + cardH / 2} V${barY} M${b.x} ${b.y + cardH / 2} V${barY} M${a.x} ${barY} H${b.x}" stroke="${color}" stroke-width="2.5" fill="none"${dash}/>`
    );
    addBox(a.x, Math.min(a.y, b.y) + cardH / 2, b.x, barY, 2);
    addBox(m.x, barY, m.x, barY, MARKER_R);
    for (const childId of u.marriage.childIds) {
      const pc = layout.positions.get(childId);
      if (!pc) continue;
      const c = at(pc);
      lines.push(`<line x1="${m.x}" y1="${barY}" x2="${c.x}" y2="${c.y - cardH / 2}" stroke="${colors.lineBlood}" stroke-width="2.2"/>`);
      addBox(m.x, barY, c.x, c.y - cardH / 2, 2);
    }
    markers.push(
      `<circle cx="${m.x}" cy="${barY}" r="${MARKER_R}" fill="${colors.panel}" stroke="${color}" stroke-width="2.5"/>` +
        `<path d="M${m.x - 7} ${barY} H${m.x + 7} M${m.x} ${barY - 7} V${barY + 7}" stroke="${color}" stroke-width="3"/>`
    );
  }

  const cards: string[] = [];
  data.people.forEach((person, i) => {
    const pos = layout.positions.get(person.id);
    if (!pos) return;
    const c = at(pos);
    const x = c.x - cardW / 2;
    const y = c.y - cardH / 2;
    const { fill, stroke } = cardColors(person);
    const clip = `card${i}`;
    addBox(x, y, x + cardW, y + cardH);
    const photo = person.photoUri?.startsWith('data:') ? person.photoUri : undefined;
    const avatar = Math.min(cardH - 24, 46);
    // With a photo, the text moves over to leave it room on the reading-start side.
    const textX = photo ? (isRTL ? c.x - avatar / 2 - 4 : c.x + avatar / 2 + 4) : c.x;
    const photoX = isRTL ? x + cardW - 10 - avatar : x + 10;
    cards.push(
      `<g>` +
        `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="14"/></clipPath>` +
        `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${person.unknown ? ' stroke-dasharray="5 4"' : ''}/>` +
        (photo
          ? `<clipPath id="${clip}p"><circle cx="${photoX + avatar / 2}" cy="${c.y}" r="${avatar / 2}"/></clipPath>` +
            `<image href="${photo}" x="${photoX}" y="${c.y - avatar / 2}" width="${avatar}" height="${avatar}" clip-path="url(#${clip}p)" preserveAspectRatio="xMidYMid slice"/>`
          : '') +
        `<text x="${textX}" y="${c.y - 4}" text-anchor="middle" font-size="17" font-weight="700" fill="${person.unknown ? colors.inkFaint : colors.ink}"${isRTL ? ' direction="rtl"' : ''}>${escape(firstNameOf(person))}</text>` +
        `<text x="${textX}" y="${c.y + 17}" text-anchor="middle" font-size="12.5" fill="${colors.inkDim}"${isRTL ? ' direction="rtl"' : ''}>${escape(lifeSpan(person))}</text>` +
        (options.showRibbon && isDeceased(person)
          ? `<line x1="${x - 4}" y1="${y + 30}" x2="${x + 30}" y2="${y - 4}" stroke="#050505" stroke-width="9" clip-path="url(#${clip})"/>`
          : '') +
        `</g>`
    );
  });

  // Everyone, oldest generation first, as a table after the tree.
  const parentsOf = (id: ID) => {
    const m = data.marriages.find((mm) => mm.childIds.includes(id));
    return m ? m.spouseIds.map((sid) => nameOf(byId.get(sid))).join(` ${t('and')} `) : '';
  };
  const spousesOf = (id: ID) =>
    data.marriages
      .filter((m) => m.spouseIds.includes(id))
      .map((m) => nameOf(byId.get(m.spouseIds.find((sid) => sid !== id)!)))
      .join('، ');
  const order = data.people
    .map((p, i) => ({ p, i, g: layout.generationOf?.get(p.id) ?? 0 }))
    .sort((a, b) => a.g - b.g || a.i - b.i)
    .map((e) => e.p);
  const rows = order
    .map(
      (p) =>
        `<tr><td class="name">${escape(nameOf(p))}</td><td>${escape(date(p.born))}</td><td>${escape(p.birthPlace ?? '')}</td>` +
        `<td>${escape(isDeceased(p) ? date(p.died) || t('deceased') : '')}</td><td>${escape(isDeceased(p) ? (p.gravePlace ?? '') : '')}</td>` +
        `<td>${escape(parentsOf(p.id))}</td><td>${escape(spousesOf(p.id))}</td></tr>`
    )
    .join('');

  const exported = options.locale === 'fa' ? date(options.exportedAt.toISOString().slice(0, 10)) : options.exportedAt.toISOString().slice(0, 10);
  const subtitle = `${t('peopleCount', { count: digits(data.people.length) })} · ${exported}`;

  // The poster: the tree at a size you can read, cut into a grid of pages
  // (see POSTER_MM_PER_UNIT). Each page shows its own window onto the one
  // drawing; the windows tile the tree exactly, edge to edge, so the parts,
  // trimmed along their dashed borders, rebuild the whole tree. The grid is
  // centered on the tree, so the spare room splits evenly around it.
  const tileW = TILE_MM.width / POSTER_MM_PER_UNIT;
  const tileH = TILE_MM.height / POSTER_MM_PER_UNIT;
  const gridCols = Math.max(1, Math.ceil(width / tileW));
  const gridRows = Math.max(1, Math.ceil(height / tileH));
  const originX = (width - gridCols * tileW) / 2;
  const originY = (height - gridRows * tileH) / 2;
  const total = gridCols * gridRows;
  const miniMap = (row: number, col: number) => {
    const cell = 9;
    const cells: string[] = [];
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const on = r === row && c === col;
        const empty = !hasContent(r, c);
        cells.push(
          `<rect x="${c * (cell + 2) + 1}" y="${r * (cell + 2) + 1}" width="${cell}" height="${cell}" rx="1.5" fill="${on ? colors.lineMarriage : empty ? 'none' : colors.panel2}" stroke="${colors.stroke}" stroke-width="0.8"${empty ? ' stroke-dasharray="2 1.5"' : ''}/>`
        );
      }
    }
    return `<svg class="minimap" width="${gridCols * (cell + 2) + 2}" height="${gridRows * (cell + 2) + 2}" xmlns="http://www.w3.org/2000/svg">${cells.join('')}</svg>`;
  };
  // A part with nothing drawn in it (an empty corner of the grid) isn't
  // printed at all: the mini map shows it as an empty outline, a gap to
  // leave when laying the rest out, and the part numbers skip it.
  const hasContent = (r: number, c: number) => {
    const x0 = originX + c * tileW;
    const y0 = originY + r * tileH;
    return boxes.some((b) => b.x1 > x0 && b.x0 < x0 + tileW && b.y1 > y0 && b.y0 < y0 + tileH);
  };
  const printed: { r: number; c: number }[] = [];
  for (let r = 0; r < gridRows; r++) for (let c = 0; c < gridCols; c++) if (hasContent(r, c)) printed.push({ r, c });
  const printedTotal = printed.length;

  const posterPages: string[] = [];
  // A tree that already fits one page at poster size needs no parts: the
  // overview on page one is it, at full size.
  if (total > 1) {
    let n = 0;
    for (const { r, c } of printed) {
      {
        n++;
        posterPages.push(`<section class="page">
  <header><h1>${escape(options.treeName)}</h1><span class="sub">${escape(t('pdfPartOf', { n: digits(n), total: digits(printedTotal) }))} · ${escape(t('pdfAssembleHint'))}</span>${miniMap(r, c)}</header>
  <div class="tile"><svg viewBox="${originX + c * tileW} ${originY + r * tileH} ${tileW} ${tileH}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use href="#tree-art" xlink:href="#tree-art"/></svg></div>
</section>`);
      }
    }
  }

  return `<!DOCTYPE html>
<html dir="${isRTL ? 'rtl' : 'ltr'}" lang="${options.locale}">
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4 landscape; margin: ${PAGE_MARGIN_MM}mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${FONT_STACK}; color: ${colors.ink}; }
  .page { page-break-after: always; height: ${210 - PAGE_MARGIN_MM * 2}mm; overflow: hidden; }
  header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid ${colors.lineMarriage}; padding-bottom: 4px; height: ${HEADER_MM - 3}mm; margin-bottom: 3mm; }
  h1 { font-size: 18px; margin: 0; flex-shrink: 0; }
  .sub { flex: 1; font-size: 11px; color: ${colors.inkDim}; }
  .minimap { flex-shrink: 0; }
  .overview svg { display: block; width: ${TILE_MM.width}mm; height: ${TILE_MM.height}mm; }
  /* Exactly one part of the poster; the dashed outline is where to trim. */
  .tile { width: ${TILE_MM.width}mm; height: ${TILE_MM.height}mm; outline: 0.3mm dashed ${colors.inkFaint}; }
  .tile svg { display: block; width: 100%; height: 100%; }
  h2 { font-size: 16px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: ${colors.panel2}; text-align: start; font-weight: 700; }
  th, td { border: 1px solid ${colors.stroke}; padding: 5px 7px; vertical-align: top; }
  td.name { font-weight: 700; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
<!-- The tree, drawn once; every page below shows it through its own window. Sized to nothing rather than display: none, which would switch off the clip paths inside it. -->
<svg width="0" height="0" style="position: absolute" xmlns="http://www.w3.org/2000/svg" font-family="${FONT_STACK.replace(/"/g, "'")}">
  <defs><g id="tree-art">
    ${lines.join('\n    ')}
    ${markers.join('\n    ')}
    ${cards.join('\n    ')}
  </g></defs>
</svg>
<section class="page overview">
  <header><h1>${escape(options.treeName)}</h1><span class="sub">${escape(subtitle)}</span></header>
  <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use href="#tree-art" xlink:href="#tree-art"/></svg>
</section>
${posterPages.join('\n')}
<section>
  <h2>${escape(t('pdfPeopleTitle'))}</h2>
  <table>
    <thead><tr><th>${escape(t('name'))}</th><th>${escape(t('bornYear'))}</th><th>${escape(t('placeOfBirth'))}</th><th>${escape(t('diedYear'))}</th><th>${escape(t('placeOfBurial'))}</th><th>${escape(t('parents'))}</th><th>${escape(t('spouse'))}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>
</body>
</html>`;
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
