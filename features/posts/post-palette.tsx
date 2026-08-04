import Link from "next/link";
import type { PaletteColor } from "@/lib/media/colors";
import { normalizeHex } from "@/lib/media/color-utils";

/**
 * Read-only palette strip for the public post view. Each swatch links to a
 * colour search, so the palette doubles as "find more designs in this shade".
 */
export function PostPalette({ colors }: { colors: PaletteColor[] }) {
  const valid = colors
    .map((c) => ({ ...c, hex: normalizeHex(c.hex) }))
    .filter((c): c is PaletteColor & { hex: string } => c.hex !== null);
  if (valid.length === 0) return null;

  const total = valid.reduce((sum, c) => sum + c.percent, 0);

  return (
    <div className="flex flex-col gap-2 border-t border-border/60 bg-card px-3 py-3">
      {/* proportion bar */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full">
        {valid.map((c, i) => (
          <span
            key={i}
            style={{
              backgroundColor: c.hex,
              width: total > 0 ? `${(c.percent / total) * 100}%` : `${100 / valid.length}%`,
            }}
          />
        ))}
      </div>
      {/* swatch chips → colour search */}
      <div className="flex flex-wrap gap-1.5">
        {valid.map((c, i) => (
          <Link
            key={i}
            href={`/search?colors=${c.hex.replace("#", "")}`}
            className="group flex items-center gap-1.5 rounded-full border border-border/60 py-1 pl-1 pr-2.5 transition-colors hover:bg-accent"
            title={`Find designs with ${c.hex}`}
          >
            <span
              className="size-4 rounded-full ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: c.hex }}
            />
            <span className="font-mono text-[11px] uppercase tracking-tight text-muted-foreground group-hover:text-foreground">
              {c.hex}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground/70">
              {c.percent}%
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
