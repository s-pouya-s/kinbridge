import type { CardStyle } from '../layout/layout';
import { shortName } from '../model/people';

/**
 * How a card's text fits: which lines it shows, at what size, cut where.
 * Pure (no React Native), so the checks can test every test family's names
 * against the same numbers the card draws with.
 *
 * Each line has a maximum and a minimum size. A short name stays at the
 * maximum (it doesn't grow to fill the card); a longer one shrinks to use
 * the card's whole width, less a small padding, down to the minimum, still
 * readable. Only a name too long even at the minimum is cut, ending in "…".
 * Text never goes past the card's edge. On the phone the card also has
 * adjustsFontSizeToFit, so a font that measures a little wider than this
 * estimate shrinks slightly instead of being cut.
 */

/** Rough width of one character, as a share of the font size, for bold text. On the wide side on purpose. */
function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code === 0x200c || code === 0x200d) return 0; // zero-width joiners (Persian half-space)
  if (ch === ' ') return 0.3;
  if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0xfb50 && code <= 0xfeff)) return 0.58; // Persian and Arabic
  // Chinese, Japanese and Korean characters, and full-width forms: a whole em each.
  if ((code >= 0x2e80 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af) || (code >= 0xff00 && code <= 0xffef) || (code >= 0x3000 && code <= 0x30ff)) return 1.0;
  if (code >= 0x0900 && code <= 0x097f) return 0.62; // Devanagari (Hindi)
  if (code >= 0x0400 && code <= 0x04ff) return 0.66; // Cyrillic (Russian)
  if (code >= 0x00c0 && code <= 0x024f) return 0.66; // Latin letters with accents (German, French, Turkish, ...)
  if ('iljtfrI.,\'|!:;'.includes(ch)) return 0.36;
  if ('MW'.includes(ch)) return 0.95;
  if ('mw'.includes(ch)) return 0.9;
  if (ch >= 'A' && ch <= 'Z') return 0.72;
  if (ch >= '0' && ch <= '9') return 0.6;
  if (ch >= 'a' && ch <= 'z') return 0.6;
  return 0.75;
}

/** Estimated width of `text` in bold at `fontSize`. */
export function textWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) units += charWidth(ch);
  return units * fontSize;
}

export interface FittedLine {
  text: string;
  fontSize: number;
}

/** `text` at the biggest size from `size` down to `minSize` that fits `maxWidth`; still too wide at `minSize`, it's cut and ends in "…". */
export function fitLine(text: string, maxWidth: number, size: number, minSize: number): FittedLine {
  const full = textWidth(text, size);
  if (full <= maxWidth) return { text, fontSize: size };
  // Shrunk to exactly the width, it fits by construction (no re-measuring:
  // rounding once made a fitting name come back cut, with "…" on the end).
  const fitted = (size * maxWidth) / full;
  if (fitted >= minSize) return { text, fontSize: fitted };
  // Too wide even at the minimum size: cut it.
  const chars = Array.from(text);
  while (chars.length > 0 && textWidth(chars.join('').trimEnd() + '…', minSize) > maxWidth) chars.pop();
  return { text: chars.join('').trimEnd() + '…', fontSize: minSize };
}

/** The card's inner padding on each side, kept small so names can use nearly the whole width. */
export const CARD_PADDING = 3;

/** Smallest a name may get before it's cut, per card style. */
export const MIN_NAME_SIZE: Record<CardStyle, number> = { compact: 14, large: 18 };

export interface CardText {
  /** Large cards with a photo show it on top; without one there's no placeholder at all. */
  showPhoto: boolean;
  photoSize: number;
  name: FittedLine;
  /** Large cards only. */
  surname?: FittedLine;
  /** Room each line may use, so the checks can test against it. */
  maxTextWidth: number;
}

/**
 * Lays out one card's text. `growth` is the tree's card growth (see
 * cardSize), which makes cards and names a little bigger in deep trees.
 */
export function cardText(
  person: { name: string; surname?: string; nickname?: string; unknown?: boolean; photoUri?: string },
  label: string,
  cardStyle: CardStyle,
  width: number,
  height: number,
  nodeHeight: number,
  growth: number
): CardText {
  const shown = shortName(person, label);
  // The card's 1px border on both sides, then a small padding. (A selected
  // card's thicker border is covered by adjustsFontSizeToFit.)
  const inner = width - 2 * 1 - 2 * CARD_PADDING;
  if (cardStyle === 'compact') {
    const photoSize = 46 * (height / nodeHeight);
    const showPhoto = !!person.photoUri;
    const maxTextWidth = inner - (showPhoto ? photoSize + 6 : 0);
    const size = (22 + growth * 0.75) * (person.unknown ? 0.8 : 1);
    return { showPhoto, photoSize, name: fitLine(shown, maxTextWidth, size, MIN_NAME_SIZE.compact), maxTextWidth };
  }
  const showPhoto = !!person.photoUri;
  const photoSize = Math.min(width - 28, height - 100);
  const maxTextWidth = inner;
  // With a photo, the name sits under it; without one the names are much bigger and fill the card.
  const nameSize = (showPhoto ? 26 : 40) + growth * 0.75;
  const name = fitLine(shown, maxTextWidth, nameSize * (person.unknown ? 0.8 : 1), MIN_NAME_SIZE.large);
  const surname = !person.unknown && person.surname ? fitLine(person.surname, maxTextWidth, nameSize * 0.7, MIN_NAME_SIZE.large * 0.8) : undefined;
  return { showPhoto, photoSize, name, surname, maxTextWidth };
}
