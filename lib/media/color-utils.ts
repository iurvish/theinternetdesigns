import type { PaletteColor } from "./colors";

/** Client-safe colour helpers (no sharp) shared by the editor and server actions. */

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export type Hsl = { h: number; s: number; l: number };

export function isHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

/** Normalise to lowercase `#rrggbb`, or null if not a 6-digit hex. */
export function normalizeHex(value: string): string | null {
  const m = HEX_RE.exec(value.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

export function hexToRgb(value: string): { r: number; g: number; b: number } | null {
  const m = HEX_RE.exec(value.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/** sRGB 0–255 → HSL with h in [0,360), s/l in [0,1]. */
export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

/** Shortest hue distance on the colour wheel, 0–180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Perceptual-ish distance between a query colour and a palette swatch.
 * Returns `null` when the swatch should not count as a match.
 *
 * Neutrals (low saturation) only match other neutrals by lightness — so a mid
 * grey query won't pull in white/near-white designs. Chromatic queries match on
 * hue first (with sat/light slack) and ignore greys, so a blue pick finds soft
 * UI blues instead of falling back to RGB-near greys.
 */
export function colorMatchDistance(query: Hsl, candidate: Hsl): number | null {
  const qNeutral = query.s < 0.14;
  const cNeutral = candidate.s < 0.14;

  if (qNeutral) {
    // Neutrals: require low saturation and similar lightness.
    if (candidate.s > 0.22) return null;
    const dl = Math.abs(query.l - candidate.l);
    if (dl > 0.16) return null;
    return dl * 120 + Math.abs(query.s - candidate.s) * 40;
  }

  // Chromatic: hue must be close; skip neutrals entirely.
  if (cNeutral) return null;
  const hd = hueDistance(query.h, candidate.h);
  // Wider hue window for softer / less-saturated query colours.
  const hueTol = 26 + (1 - Math.min(query.s, 1)) * 18;
  if (hd > hueTol) return null;
  const ds = Math.abs(query.s - candidate.s);
  const dl = Math.abs(query.l - candidate.l);
  if (ds > 0.6 || dl > 0.5) return null;
  // Hue dominates the score; sat/light are tie-breakers.
  return hd * 2.2 + ds * 35 + dl * 28;
}

/**
 * Best match of `query` against a palette. Lower is better. `null` = no match.
 * Weights closer swatches that cover more of the image (`percent`).
 */
export function bestPaletteDistance(
  query: Hsl,
  palette: Array<{ r: number; g: number; b: number; percent?: number }>,
): number | null {
  let best: number | null = null;
  for (const swatch of palette) {
    const dist = colorMatchDistance(query, rgbToHsl(swatch.r, swatch.g, swatch.b));
    if (dist == null) continue;
    // Slight boost for dominant colours (percent 0–100 → weight 0.75–1.25).
    const weight = 1.25 - Math.min(Math.max(swatch.percent ?? 25, 0), 100) / 200;
    const scored = dist * weight;
    if (best == null || scored < best) best = scored;
  }
  return best;
}

/**
 * Coerce an admin-edited palette into a clean, stored-shape palette: valid hex,
 * `r/g/b` re-derived from the hex (so colour search stays correct), and percent
 * clamped to 0–100. Invalid entries are dropped.
 */
export function sanitizePalette(input: unknown): PaletteColor[] {
  if (!Array.isArray(input)) return [];
  const out: PaletteColor[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const hexRaw = (raw as { hex?: unknown }).hex;
    if (typeof hexRaw !== "string") continue;
    const hex = normalizeHex(hexRaw);
    if (!hex) continue;
    const rgb = hexToRgb(hex)!;
    const pctRaw = Number((raw as { percent?: unknown }).percent);
    const percent = Number.isFinite(pctRaw)
      ? Math.max(0, Math.min(100, Math.round(pctRaw)))
      : 0;
    out.push({ hex, r: rgb.r, g: rgb.g, b: rgb.b, percent });
  }
  return out.slice(0, 8);
}
