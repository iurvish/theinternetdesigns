"use client";
import { Plus, RefreshCw, X } from "lucide-react";
import type { PaletteColor } from "@/lib/media/colors";
import { hexToRgb, normalizeHex } from "@/lib/media/color-utils";
import { cn } from "@/lib/utils";

const MAX_SWATCHES = 6;
const NEUTRAL = "#888888";

/**
 * Presentational palette editor shared by the new-post and edit-post flows:
 * a thumbnail, a live proportion bar, tap-to-recolour swatches with editable
 * hex + percent, add/remove, and an optional "re-extract" escape hatch.
 */
export function PaletteEditor({
  colors,
  onColors,
  thumbnailSrc,
  onReextract,
  reextracting,
}: {
  colors: PaletteColor[];
  onColors: (next: PaletteColor[]) => void;
  thumbnailSrc?: string | null;
  onReextract?: () => void;
  reextracting?: boolean;
}) {
  const total = colors.reduce((sum, c) => sum + c.percent, 0);

  function setColor(i: number, patch: Partial<PaletteColor>) {
    onColors(colors.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function setHex(i: number, raw: string) {
    const hex = normalizeHex(raw);
    if (!hex) {
      setColor(i, { hex: raw }); // keep in-progress text; sanitised on save
      return;
    }
    const rgb = hexToRgb(hex)!;
    setColor(i, { hex, r: rgb.r, g: rgb.g, b: rgb.b });
  }
  function remove(i: number) {
    onColors(colors.filter((_, idx) => idx !== i));
  }
  function add() {
    const rgb = hexToRgb(NEUTRAL)!;
    onColors([...colors, { hex: NEUTRAL, r: rgb.r, g: rgb.g, b: rgb.b, percent: 0 }]);
  }

  return (
    <div className="flex gap-3 rounded-xl border border-border/60 bg-card p-3">
      {thumbnailSrc ? (
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnailSrc} alt="" className="size-full object-cover" />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {/* proportion bar — usage % made visual */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {colors.map((c, i) => (
            <span
              key={i}
              style={{
                backgroundColor: normalizeHex(c.hex) ?? "transparent",
                width:
                  total > 0
                    ? `${(c.percent / total) * 100}%`
                    : `${100 / Math.max(colors.length, 1)}%`,
              }}
            />
          ))}
        </div>

        {/* editable swatches */}
        <div className="flex flex-col gap-1.5">
          {colors.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No colours. Add one or re-extract.
            </span>
          ) : null}
          {colors.map((c, i) => {
            const valid = normalizeHex(c.hex);
            return (
              <div key={i} className="flex items-center gap-2">
                <label
                  className="relative size-6 shrink-0 cursor-pointer rounded-md ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: valid ?? "#ffffff" }}
                  title="Pick colour"
                >
                  <input
                    type="color"
                    value={valid ?? "#000000"}
                    onChange={(e) => setHex(i, e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Pick colour"
                  />
                </label>
                <input
                  value={c.hex}
                  onChange={(e) => setHex(i, e.target.value)}
                  spellCheck={false}
                  className={cn(
                    "w-24 rounded-md border bg-background px-2 py-1 font-mono text-xs uppercase tracking-tight outline-none focus:border-ring",
                    valid ? "border-input" : "border-destructive text-destructive",
                  )}
                  placeholder="#000000"
                  aria-label="Hex value"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={c.percent}
                    onChange={(e) =>
                      setColor(i, {
                        percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      })
                    }
                    className="w-14 rounded-md border border-input bg-background px-2 py-1 text-xs tabular-nums outline-none focus:border-ring"
                    aria-label="Usage percent"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Remove colour"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* actions */}
        <div className="flex items-center gap-3">
          {colors.length < MAX_SWATCHES ? (
            <button
              type="button"
              onClick={add}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="size-3.5" /> Add colour
            </button>
          ) : null}
          {onReextract ? (
            <button
              type="button"
              onClick={onReextract}
              disabled={reextracting}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", reextracting && "animate-spin")} />
              {reextracting ? "Re-extracting…" : "Re-extract"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
