"use client";
import { useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Plus, RefreshCw, X } from "lucide-react";
import type { PaletteColor } from "@/lib/media/colors";
import { hexToRgb, normalizeHex } from "@/lib/media/color-utils";
import { cn } from "@/lib/utils";
import { reextractMediaColors } from "../../actions";

export type EditMedia = {
  id: string;
  kind: "image" | "video" | "gif";
  still: string;
  colors: PaletteColor[];
};

const MAX_SWATCHES = 6;
const NEUTRAL = "#888888";

/** The whole "Colours" section of the edit form — one palette per media. */
export function MediaPalettes({
  media,
  palettes,
  onChange,
}: {
  media: EditMedia[];
  palettes: Record<string, PaletteColor[]>;
  onChange: (next: Record<string, PaletteColor[]>) => void;
}) {
  if (media.length === 0) return null;
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Colours</span>
        <span className="text-xs text-muted-foreground">
          Extracted at upload — tap a swatch to recolour, or re-extract.
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {media.map((m) => (
          <MediaPaletteCard
            key={m.id}
            media={m}
            colors={palettes[m.id] ?? []}
            onColors={(next) => onChange({ ...palettes, [m.id]: next })}
          />
        ))}
      </div>
    </div>
  );
}

function MediaPaletteCard({
  media,
  colors,
  onColors,
}: {
  media: EditMedia;
  colors: PaletteColor[];
  onColors: (next: PaletteColor[]) => void;
}) {
  const [pending, startTransition] = useTransition();
  const total = colors.reduce((sum, c) => sum + c.percent, 0);

  function setColor(i: number, patch: Partial<PaletteColor>) {
    onColors(colors.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function setHex(i: number, raw: string) {
    const hex = normalizeHex(raw);
    if (!hex) {
      setColor(i, { hex: raw }); // keep the in-progress text; sanitised on save
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
  function reextract() {
    startTransition(async () => {
      const res = await reextractMediaColors(media.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onColors(res.colors);
      toast.success("Re-extracted from image.");
    });
  }

  return (
    <div className="flex gap-3 rounded-xl border border-border/60 bg-card p-3">
      {/* thumbnail reference */}
      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        {media.still ? (
          <Image src={media.still} alt="" fill sizes="64px" className="object-cover" />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {/* proportion bar — usage % made visual */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {colors.map((c, i) => (
            <span
              key={i}
              style={{
                backgroundColor: normalizeHex(c.hex) ?? "transparent",
                width: total > 0 ? `${(c.percent / total) * 100}%` : `${100 / Math.max(colors.length, 1)}%`,
              }}
            />
          ))}
        </div>

        {/* editable swatches */}
        <div className="flex flex-col gap-1.5">
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
          <button
            type="button"
            onClick={reextract}
            disabled={pending}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
            {pending ? "Re-extracting…" : "Re-extract"}
          </button>
        </div>
      </div>
    </div>
  );
}
