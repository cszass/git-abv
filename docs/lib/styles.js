// Generated from src/core by `npm run sync:web`. Do not edit here.
/**
 * ABV → drink style. The fun part.
 *
 * Bands follow real-world drinks loosely: beer sits around 5%, wine around 12%,
 * spirits around 40%. `from` is inclusive; the next band's `from` is the upper bound.
 *
 *   accent: bright colour, readable on dark backgrounds (terminal, night label)
 *   ink:    deep colour, readable on paper (paper label, badge)
 */

export const STYLES = [
  { id: 'alcohol-free', from: 0, emoji: '🧃', accent: '#7EE787', ink: '#3F7D4E' },
  { id: 'kombucha', from: Number.MIN_VALUE, emoji: '🍵', accent: '#B4E08C', ink: '#5E7F2E' },
  { id: 'shandy', from: 0.5, emoji: '🍋', accent: '#F2CC60', ink: '#9A7400' },
  { id: 'lager', from: 3, emoji: '🍺', accent: '#F5B642', ink: '#A66A00' },
  { id: 'wine', from: 8, emoji: '🍷', accent: '#F47C8C', ink: '#8E2A3F' },
  { id: 'port', from: 16, emoji: '🍶', accent: '#F0883E', ink: '#A04E12' },
  { id: 'whisky', from: 25, emoji: '🥃', accent: '#F69D50', ink: '#9C4A12' },
  { id: 'cask', from: 45, emoji: '🔥', accent: '#FF7B54', ink: '#A6321A' },
  { id: 'absinthe', from: 60, emoji: '🧪', accent: '#56D364', ink: '#2F6B2C' },
  { id: 'rectified', from: 80, emoji: '⚗️', accent: '#D2A8FF', ink: '#5B2D91' },
  { id: 'rocket-fuel', from: 95, emoji: '🚀', accent: '#FF6AC1', ink: '#8C1D5B' },
];

/** @param {number} abv percentage, 0–100 */
export function styleFor(abv) {
  const v = Math.max(0, Math.min(100, Number(abv) || 0));
  let found = STYLES[0];
  for (const s of STYLES) {
    if (v >= s.from) found = s;
  }
  return found;
}

export function styleById(id) {
  return STYLES.find((s) => s.id === id) || STYLES[0];
}

/** US proof is simply twice the ABV. */
export function proofFor(abv) {
  return Math.round((Number(abv) || 0) * 2);
}
