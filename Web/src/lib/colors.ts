// Player-chosen colours (Settings → Colours). Each choice overrides a few CSS
// variables on <html>; tints and text colours are derived so one pick is enough.

import type { ColorKey } from './storage';

export const COLOR_CHOICES: { key: ColorKey; label: string; variable: string }[] = [
  { key: 'accent', label: 'Buttons & links', variable: '--accent' },
  { key: 'done', label: 'Finished dailies', variable: '--done' },
  { key: 'select', label: 'Selected square', variable: '--cell-sel' },
  { key: 'match', label: 'Matching numbers', variable: '--cell-match-text' },
];

/** Every variable a choice sets, as a function of the chosen colour. */
const DERIVED: Record<ColorKey, Record<string, (c: string) => string>> = {
  accent: {
    '--accent': (c) => c,
    '--accent-text': readableOn,
    '--accent-soft': (c) => `color-mix(in srgb, ${c} 32%, transparent)`,
    '--accent-softer': (c) => `color-mix(in srgb, ${c} 16%, transparent)`,
    '--t-focus': (c) => `color-mix(in srgb, ${c} 18%, transparent)`,
  },
  done: {
    '--done': (c) => c,
    '--done-text': readableOn,
  },
  select: {
    '--cell-sel': (c) => c,
    '--cell-sel-text': readableOn,
  },
  match: {
    '--cell-match-text': (c) => c,
    '--cell-match': (c) => `color-mix(in srgb, ${c} 18%, var(--surface))`,
  },
};

export function applyColors(colors: Partial<Record<ColorKey, string>>): void {
  const style = document.documentElement.style;
  for (const key of Object.keys(DERIVED) as ColorKey[]) {
    const chosen = colors[key];
    for (const [name, derive] of Object.entries(DERIVED[key])) {
      if (chosen) style.setProperty(name, derive(chosen));
      else style.removeProperty(name);
    }
  }
}

/** The colour currently showing for a choice, as #rrggbb for <input type=color>. */
export function currentColor(variable: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#2f6fde';
}

/** Near-black or white, whichever reads better on `hex`. */
function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.4 ? '#111114' : '#ffffff';
}
