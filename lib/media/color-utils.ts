import type { PaletteColor } from "./colors";

/** Client-safe colour helpers (no sharp) shared by the editor and server actions. */

const HEX_RE = /^#?([0-9a-f]{6})$/i;

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
