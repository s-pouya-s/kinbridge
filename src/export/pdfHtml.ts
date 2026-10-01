import type { FamilyData, ID, Person } from '../types';
import type { TFunction } from '../i18n';
import type { Theme } from '../theme';
import { cardSize, LARGE_METRICS, MARKER_RADIUS, MARKER_RADIUS_X, mirrorX } from '../layout/layout';
import { makeUnionRouter } from '../layout/routes';
import { cardText, fitLine, textWidth } from '../components/cardText';
import { computeParentChildLayout } from '../layout/parentChildLayout';
import { isDeceased } from '../model/people';
import { isoToJalali, toPersianDigits } from '../utils/jalali';

/** Room around the tree inside the drawing, as on the canvas (see TreeCanvas's CANVAS_PADDING). */
const PAD = 80;
/** The ⊕ on paper: the app's own oval (MARKER_RADIUS_X across, MARKER_RADIUS up and down). */
const MARKER_R = MARKER_RADIUS;
const MARKER_RX = MARKER_RADIUS_X;
/** The PDF draws the large card style: the same layout, card size and text as the app's large cards. */
const METRICS = LARGE_METRICS;

const FONT_STACK = "'Vazirmatn', 'Noto Naskh Arabic', 'Noto Sans Arabic', Tahoma, sans-serif";
/** A4 landscape, in millimeters. */
const PAGE_MM = { width: 297, height: 210 };
/**
 * The blank border on the overview and the people table. Poster parts have
 * none: their tree runs to the left, right and bottom edges of the paper.
 */
const PAGE_MARGIN_MM = 8;
/**
 * The strip at the top of each poster part: name, part number and a small
 * map of where it goes. When the parts are laid out, it tucks under the
 * part above, so the tree carries on with no gap and nothing to cut.
 */
const HEADER_MM = 10;
/** The overview page's own title row. */
const OVERVIEW_HEADER_MM = 14;
/** CSS pixels per millimeter, for sizing the small placement map to fit the strip. */
const PX_PER_MM = 96 / 25.4;
/** The tree area on each poster part: the whole page below the header strip. */
const TILE_MM = { width: PAGE_MM.width, height: PAGE_MM.height - HEADER_MM };
/**
 * The poster's scale: millimeters of paper per unit of the tree drawing. A
 * large card (about 210 by 310 units) prints about 3 by 4.4 cm, with names
 * around 15 pt, and a sheet holds two to three generations: readable when
 * the parts are laid out on a table or a wall.
 */
const POSTER_MM_PER_UNIT = 0.14;

export interface PdfOptions {
  treeName: string;
  isRTL: boolean;
  locale: 'fa' | 'en';
  t: TFunction;
  /** Always the light theme: a PDF is for paper. */
  colors: Theme;
  showRibbon: boolean;
  exportedAt: Date;
  /**
   * Android's PDF maker always makes portrait pages, whatever size is asked
   * for, and shrank each landscape page into the top half of one. With this
   * set, every sheet is portrait and each landscape page is turned a
   * quarter turn to fill it: printed, it's exactly the landscape page.
   */
  turnPages?: boolean;
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
  const layout = computeParentChildLayout(data, METRICS);
  const byId = new Map(data.people.map((p) => [p.id, p]));

  const { width: cardW, height: cardH, growth } = cardSize(layout.maxGen, METRICS);
  const routeUnion = makeUnionRouter(layout, cardH);
  const width = layout.width + PAD * 2;
  // Card centers sit at their row's y, so the top row needs half a card of room above it.
  const height = layout.height + PAD * 2 + cardH / 2;
  // Same mapping as TreeCanvas's toCanvas: mirrored for RTL, shifted past the tree's own left edge.
  const at = (p: { x: number; y: number }) => ({
    x: (isRTL ? mirrorX(p.x, layout.minX, layout.maxX) : p.x) - layout.minX + PAD + METRICS.colSpacing / 2,
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
    // Nothing at all when no date is known, rather than a lone "?".
    if (p.unknown || (!p.born && !p.died)) return '';
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
    const routes = routeUnion(u);
    if (!routes) continue;
    const m = at({ x: u.markerX, y: u.markerY });
    const barY = m.y;
    const color = u.marriage.status === 'current' ? colors.lineMarriage : colors.lineEnded;
    const dash = u.marriage.status === 'ended' ? ' stroke-dasharray="6 5"' : '';
    // The same straight lines the app draws (see makeUnionRouter).
    const pathOf = (points: { x: number; y: number }[]) => {
      const pts = points.map(at);
      pts.forEach((p, i) => i > 0 && addBox(pts[i - 1].x, pts[i - 1].y, p.x, p.y, 2));
      return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
    };
    lines.push(`<path d="${routes.spouses.map(pathOf).join(' ')}" stroke="${color}" stroke-width="3" fill="none"${dash}/>`);
    addBox(m.x - MARKER_RX, barY - MARKER_R, m.x + MARKER_RX, barY + MARKER_R);
    for (const { points } of routes.children) {
      lines.push(`<path d="${pathOf(points)}" stroke="${colors.lineBlood}" stroke-width="2.8" fill="none"/>`);
    }
    markers.push(
      `<ellipse cx="${m.x}" cy="${barY}" rx="${MARKER_RX}" ry="${MARKER_R}" fill="${colors.panel}" stroke="${color}" stroke-width="3.5"/>` +
        // + for a current marriage, ✕ for an ended one, as in the app.
        (u.marriage.status === 'ended'
          ? `<path d="M${m.x - 11} ${barY - 11} L${m.x + 11} ${barY + 11} M${m.x - 11} ${barY + 11} L${m.x + 11} ${barY - 11}" stroke="${color}" stroke-width="4.5"/>`
          : `<path d="M${m.x - 19} ${barY} H${m.x + 19} M${m.x} ${barY - 13} V${barY + 13}" stroke="${color}" stroke-width="4.5"/>`)
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
    // The app's large card: a photo square on top when there is one, then
    // the name, surname and years, sized and cut exactly as on screen (see
    // cardText); without a photo the names are bigger and centered.
    const text = cardText({ ...person, photoUri: photo }, t('unknown'), 'large', cardW, cardH, METRICS.nodeHeight, growth);
    const span = lifeSpan(person) ? fitLine(lifeSpan(person), text.maxTextWidth, (text.showPhoto ? 18 : 22) + growth * 0.5, 13) : undefined;
    const lines = [
      { line: text.name, weight: 700, fill: person.unknown ? colors.inkFaint : colors.ink },
      ...(text.surname ? [{ line: text.surname, weight: 600, fill: colors.inkDim }] : []),
      ...(span ? [{ line: span, weight: 400, fill: colors.inkDim }] : []),
    ];
    const blockHeight = lines.reduce((h, l) => h + l.line.fontSize * 1.3, 0);
    const photoTop = y + 14;
    let lineTop = text.showPhoto ? photoTop + text.photoSize + 10 : c.y - blockHeight / 2;
    const textSvg = lines
      .map((l) => {
        const h = l.line.fontSize * 1.3;
        // Drawn at exactly its measured width (never wider than the card's
        // text area), so a font wider than the estimate still can't run past
        // the card's edge.
        const length = textWidth(l.line.text, l.line.fontSize);
        const out = `<text x="${c.x}" y="${lineTop + h / 2}" dominant-baseline="central" text-anchor="middle" font-size="${l.line.fontSize}" font-weight="${l.weight}" fill="${l.fill}" textLength="${length}" lengthAdjust="spacingAndGlyphs"${isRTL ? ' direction="rtl"' : ''}>${escape(l.line.text)}</text>`;
        lineTop += h;
        return out;
      })
      .join('');
    cards.push(
      `<g>` +
        `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="16"/></clipPath>` +
        `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${person.unknown ? ' stroke-dasharray="5 4"' : ''}/>` +
        (text.showPhoto && photo
          ? `<clipPath id="${clip}p"><rect x="${c.x - text.photoSize / 2}" y="${photoTop}" width="${text.photoSize}" height="${text.photoSize}" rx="14"/></clipPath>` +
            `<image href="${photo}" x="${c.x - text.photoSize / 2}" y="${photoTop}" width="${text.photoSize}" height="${text.photoSize}" clip-path="url(#${clip}p)" preserveAspectRatio="xMidYMid slice"/>`
          : '') +
        textSvg +
        (options.showRibbon && isDeceased(person)
          ? `<line x1="${x - 6}" y1="${y + 44}" x2="${x + 44}" y2="${y - 6}" stroke="#050505" stroke-width="16" clip-path="url(#${clip})"/>`
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
        `<td>${escape(isDeceased(p) ? date(p.died) || t('deceasedStatus') : '')}</td><td>${escape(isDeceased(p) ? (p.gravePlace ?? '') : '')}</td>` +
        `<td>${escape(parentsOf(p.id))}</td><td>${escape(spousesOf(p.id))}</td></tr>`
    )
    .join('');

  const exported = options.locale === 'fa' ? date(options.exportedAt.toISOString().slice(0, 10)) : options.exportedAt.toISOString().slice(0, 10);
  const subtitle = `${t('peopleCount', { count: digits(data.people.length) })} · ${exported}`;

  // The poster: the tree at a size you can read, cut into a grid of pages
  // (see POSTER_MM_PER_UNIT). Each page shows its own window onto the one
  // drawing; the windows tile the tree exactly, edge to edge, so the parts,
  // laid side by side with each header strip under the part above, rebuild
  // the whole tree without any trimming. The grid is
  // centered on the tree, so the spare room splits evenly around it.
  const tileW = TILE_MM.width / POSTER_MM_PER_UNIT;
  const tileH = TILE_MM.height / POSTER_MM_PER_UNIT;
  const gridCols = Math.max(1, Math.ceil(width / tileW));
  const gridRows = Math.max(1, Math.ceil(height / tileH));
  const originX = (width - gridCols * tileW) / 2;
  const originY = (height - gridRows * tileH) / 2;
  const total = gridCols * gridRows;
  // The small placement map fills the strip's height (less 1 mm each side),
  // so the strip holds no empty space around it.
  const mapCell = Math.min(9, ((HEADER_MM - 2) * PX_PER_MM - 2) / gridRows - 2);
  const miniMap = (row: number, col: number) => {
    const cell = mapCell;
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

  // Each landscape page as it goes on paper: as is, or turned a quarter turn
  // into a portrait sheet (see PdfOptions.turnPages).
  const sheet = (page: string) => (options.turnPages ? `<div class="sheet">${page}</div>` : page);
  const posterPages: string[] = [];
  // A tree that already fits one page at poster size needs no parts: the
  // overview on page one is it, at full size.
  if (total > 1) {
    let n = 0;
    for (const { r, c } of printed) {
      {
        n++;
        posterPages.push(sheet(`<section class="page part">
  <header><h1>${escape(options.treeName)}</h1><span class="sub">${escape(t('pdfPartOf', { n: digits(n), total: digits(printedTotal) }))} · ${escape(t('pdfAssembleHint'))}</span>${miniMap(r, c)}</header>
  <div class="tile"><svg viewBox="${originX + c * tileW} ${originY + r * tileH} ${tileW} ${tileH}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use href="#tree-art" xlink:href="#tree-art"/></svg></div>
</section>`));
      }
    }
  }

  return `<!DOCTYPE html>
<html dir="${isRTL ? 'rtl' : 'ltr'}" lang="${options.locale}">
<head>
<meta charset="utf-8"/>
<style>
  /* No page margin: the poster parts fill the paper. The overview pads itself; the table gets a page style of its own. */
  @page { size: ${options.turnPages ? `${PAGE_MM.height}mm ${PAGE_MM.width}mm` : `${PAGE_MM.width}mm ${PAGE_MM.height}mm`}; margin: 0; }
  @page people { margin: ${PAGE_MARGIN_MM}mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${FONT_STACK}; color: ${colors.ink}; }
  .page { page-break-after: always; width: ${PAGE_MM.width}mm; height: ${PAGE_MM.height}mm; overflow: hidden; }
  /* A portrait sheet holding one landscape page, turned a quarter turn clockwise to fill it. */
  .sheet { position: relative; width: ${PAGE_MM.height}mm; height: ${PAGE_MM.width}mm; overflow: hidden; page-break-after: always; }
  .sheet > .page { position: absolute; top: 0; left: 0; page-break-after: auto; transform-origin: 0 0; transform: translateX(${PAGE_MM.height}mm) rotate(90deg); }
  header { display: flex; align-items: center; gap: 12px; height: ${HEADER_MM}mm; }
  h1 { font-size: 18px; margin: 0; flex-shrink: 0; }
  .sub { flex: 1; font-size: 11px; color: ${colors.inkDim}; }
  .minimap { flex-shrink: 0; }
  .overview { padding: ${PAGE_MARGIN_MM}mm; }
  .overview header { border-bottom: 2px solid ${colors.lineMarriage}; margin-bottom: 3mm; height: ${OVERVIEW_HEADER_MM - 3}mm; }
  .overview svg { display: block; width: 100%; height: ${PAGE_MM.height - OVERVIEW_HEADER_MM - PAGE_MARGIN_MM * 2}mm; }
  /* A poster part: the header strip, inset a little so a printer can reach its text, then the tree right to the paper's edges. */
  .part header { padding: 0 2mm; background: ${colors.panel2}; border-bottom: 0.4mm solid ${colors.lineMarriage}; }
  .tile { width: ${TILE_MM.width}mm; height: ${TILE_MM.height}mm; }
  .tile svg { display: block; width: 100%; height: 100%; }
  .people { page: people; }
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
${sheet(`<section class="page overview">
  <header><h1>${escape(options.treeName)}</h1><span class="sub">${escape(subtitle)}</span></header>
  <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use href="#tree-art" xlink:href="#tree-art"/></svg>
</section>`)}
${posterPages.join('\n')}
<section class="people">
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
