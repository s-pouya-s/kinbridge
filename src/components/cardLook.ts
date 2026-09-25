import type { Person } from '../types';
import type { Theme } from '../theme';

/** Blends two #RRGGBB colors: `amount` 0 is all `a`, 1 is all `b`. */
function mixHex(a: string, b: string, amount: number) {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * amount));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** A person card's fill and border colors, by gender (neutral when unset, faint for an unknown person). */
export function cardColors(person: Person, theme: Theme) {
  if (person.unknown) return { fill: theme.panel2, stroke: theme.inkFaint };
  if (person.gender === 'male') return { fill: theme.maleFill, stroke: theme.maleStroke };
  if (person.gender === 'female') return { fill: theme.femaleFill, stroke: theme.femaleStroke };
  return { fill: theme.nodeFill, stroke: theme.nodeStroke };
}

/**
 * The raised look shared by every person card: a vertical gradient, lit
 * from above (a lighter tint of the fill at the top, a slightly deeper one
 * at the bottom), a thin inner highlight along the top edge, and a soft
 * drop shadow underneath. Goes on top of a plain backgroundColor, which
 * stays as the fallback wherever gradients aren't supported (web).
 */
export function raisedCardStyle(fill: string, theme: Theme) {
  return {
    experimental_backgroundImage: `linear-gradient(180deg, ${mixHex(fill, '#FFFFFF', 0.16)} 0%, ${fill} 55%, ${mixHex(fill, '#000000', 0.14)} 100%)`,
    boxShadow: `0px 6px 14px ${theme.cardShadow}, inset 0px 1px 0px rgba(255,255,255,0.22)`,
  };
}
