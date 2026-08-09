"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pipette, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX_COLORS = 2;

/** Paper nodes 90-0 / AG-0 — split colour-tag segments */
const TAG_SEGMENT_SHADOW =
  "shadow-[0_0_0_1px_rgba(232,232,232,0.6),0_3px_9px_0_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)]";

const tagSegmentClass =
  "flex shrink-0 items-center justify-center overflow-hidden bg-white";

/** Toolbar swatch — Paper node BI-0 / BJ-0 (20×20 inside 38×38 segment) */
function TagSwatchChip({
  color,
  onClick,
  onRemove,
}: {
  color: string;
  onClick?: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group/swatch relative shrink-0">
      <button
        type="button"
        onClick={onClick}
        className="block size-5 overflow-hidden rounded-md border border-black/10"
        style={{ backgroundColor: color }}
        aria-label={`Colour ${color}`}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${color}`}
        className="absolute -right-1 -top-1 z-10 flex size-3.5 items-center justify-center rounded-full bg-[#1f2123] text-white shadow-sm"
      >
        <X className="size-2" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* ── colour math ────────────────────────────────────────────────────────── */
type HSV = { h: number; s: number; v: number };

function hsvToRgb({ h, s, v }: HSV) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function hsvToHex(hsv: HSV) {
  const { r, g, b } = hsvToRgb(hsv);
  return (
    "#" +
    [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
  );
}

function hexToHsv(hex: string): HSV | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = h * 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/* ── colour-dots glyph (Figma node 16:254) ──────────────────────────────── */
function ColorDotsIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden>
      <circle cx="9" cy="3.21" r="2.32" fill="#9c6030" />
      <circle cx="15.09" cy="7.63" r="2.32" fill="#a0213e" />
      <circle cx="12.76" cy="14.79" r="2.32" fill="#ebb042" />
      <circle cx="5.24" cy="14.79" r="2.32" fill="#77cdd0" />
      <circle cx="2.91" cy="7.63" r="2.32" fill="#6951f5" />
    </svg>
  );
}

/** Shared swatch — flat colour tile; active state uses an outer ring so it reads on any hue. */
function ColorSwatch({
  color,
  size = "sm",
  active,
  onClick,
  onRemove,
  className,
}: {
  color: string;
  size?: "sm" | "md";
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}) {
  const dim = size === "md" ? "size-8 rounded-[7px]" : "size-6 rounded-[6px]";
  const tileClass = cn(
    "block overflow-hidden ring-1 ring-inset ring-black/10",
    dim,
    onClick && "transition-transform active:scale-[0.94] motion-reduce:active:scale-100",
  );

  return (
    <div
      className={cn(
        "group/swatch relative shrink-0 rounded-[7px]",
        active && "ring-2 ring-[#1f2123] ring-offset-2 ring-offset-white",
        className,
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={tileClass}
          style={{ backgroundColor: color }}
          aria-label={`Colour ${color}`}
          aria-current={active ? "true" : undefined}
        />
      ) : (
        <span className={tileClass} style={{ backgroundColor: color }} aria-hidden />
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${color}`}
          className={cn(
            "absolute flex items-center justify-center rounded-full bg-[#1f2123] text-white shadow-sm",
            size === "md" ? "-right-1.5 -top-1.5 size-4" : "-right-1 -top-1 size-3.5",
          )}
        >
          <X className={size === "md" ? "size-2.5" : "size-2"} strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

/* ── the control ────────────────────────────────────────────────────────── */
export function ColorSearch({
  selected,
  onSelected,
}: {
  selected: string[];
  onSelected: (colors: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hsv, setHsv] = useState<HSV>({ h: 145, s: 0.55, v: 0.87 });
  const [hexInput, setHexInput] = useState(() => hsvToHex({ h: 145, s: 0.55, v: 0.87 }));
  const [draft, setDraft] = useState<string[]>(selected);
  const [editIdx, setEditIdx] = useState(selected.length);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = hsvToHex(hsv);
  const hasSelection = selected.length > 0;

  const draftRef = useRef<string[]>(selected);
  const editIdxRef = useRef(selected.length);
  const setEdit = useCallback((i: number) => {
    editIdxRef.current = i;
    setEditIdx(i);
  }, []);
  const writeDraft = useCallback((arr: string[]) => {
    draftRef.current = arr;
    setDraft(arr);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const commitColor = useCallback(
    (hex: string) => {
      const arr = [...draftRef.current];
      let idx = editIdxRef.current;
      if (idx < arr.length) arr[idx] = hex;
      else if (arr.length < MAX_COLORS) {
        arr.push(hex);
        idx = arr.length - 1;
      } else {
        idx = arr.length - 1;
        arr[idx] = hex;
      }
      setEdit(idx);
      writeDraft(arr);
    },
    [setEdit, writeDraft],
  );

  const applyHsv = useCallback(
    (next: HSV) => {
      setHsv(next);
      const hex = hsvToHex(next);
      setHexInput(hex);
      commitColor(hex);
    },
    [commitColor],
  );

  const onHexChange = (raw: string) => {
    setHexInput(raw);
    const parsed = hexToHsv(raw);
    if (parsed) {
      setHsv(parsed);
      commitColor(hsvToHex(parsed));
    }
  };

  const addSlot = () => {
    if (draftRef.current.length >= MAX_COLORS) return;
    setEdit(draftRef.current.length);
    commitColor(current);
  };

  const removeColor = (idx: number) => {
    const arr = draftRef.current.filter((_, i) => i !== idx);
    writeDraft(arr);
    setEdit(arr.length);
  };

  const editBead = (idx: number) => {
    setEdit(idx);
    const parsed = hexToHsv(draft[idx]);
    if (parsed) {
      setHsv(parsed);
      setHexInput(draft[idx]);
    }
  };

  const clearAll = () => {
    writeDraft([]);
    setEdit(0);
    onSelected([]);
    setOpen(false);
  };

  const removeSelected = (idx: number) => {
    const next = selected.filter((_, i) => i !== idx);
    writeDraft(next);
    setEdit(next.length);
    onSelected(next);
  };

  const openPicker = (addMode = false) => {
    if (open) {
      setOpen(false);
      return;
    }
    writeDraft(selected);
    setEdit(addMode ? selected.length : Math.max(0, selected.length - 1));
    const seed =
      selected.length > 0
        ? addMode
          ? selected[selected.length - 1]
          : selected[Math.max(0, selected.length - 1)]
        : null;
    if (seed) {
      const parsed = hexToHsv(seed);
      if (parsed) {
        setHsv(parsed);
        setHexInput(seed);
      }
    }
    setOpen(true);
    setHovered(false);
  };

  const openPickerAt = (idx: number) => {
    if (open) {
      setOpen(false);
      return;
    }
    writeDraft(selected);
    setEdit(idx);
    const parsed = hexToHsv(selected[idx]);
    if (parsed) {
      setHsv(parsed);
      setHexInput(selected[idx]);
    }
    setOpen(true);
    setHovered(false);
  };

  const onSearch = () => {
    const arr = draftRef.current.length ? draftRef.current : [current];
    onSelected(arr);
    setOpen(false);
  };

  const useEyedropper = async () => {
    const EyeDropper = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropper) return;
    try {
      const { sRGBHex } = await new EyeDropper().open();
      onHexChange(sRGBHex);
    } catch {
      /* user cancelled */
    }
  };

  const hasEyedropper = typeof window !== "undefined" && "EyeDropper" in window;

  const atMaxColors = selected.length >= MAX_COLORS;

  return (
    <div ref={rootRef} className="relative">
      {/* Split tag — Paper nodes AN-0 / AT-0 */}
      <div className="flex items-stretch gap-px">
        <button
          type="button"
          onClick={() => (hasSelection ? openPickerAt(0) : openPicker())}
          onMouseEnter={() => !hasSelection && setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-label={hasSelection ? "Edit colours" : "Search by colour"}
          className={cn(
            tagSegmentClass,
            "relative overflow-visible rounded-l-xl transition-transform active:scale-[0.98] motion-reduce:active:scale-100",
            hasSelection
              ? selected.length === 1
                ? "size-[38px] p-2"
                : "h-[38px] gap-2 px-2 py-2"
              : "size-[38px] p-2",
            TAG_SEGMENT_SHADOW,
          )}
        >
          {hasSelection ? (
            selected.map((c, i) => (
              <TagSwatchChip
                key={`${c}-${i}`}
                color={c}
                onClick={() => openPickerAt(i)}
                onRemove={() => removeSelected(i)}
              />
            ))
          ) : (
            <ColorDotsIcon className="size-[22px]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (atMaxColors) clearAll();
            else openPicker(hasSelection);
          }}
          aria-label={atMaxColors ? "Clear colours" : "Add colour"}
          className={cn(
            tagSegmentClass,
            "size-[38px] rounded-r-xl px-2 py-2.5 transition-transform active:scale-[0.98] motion-reduce:active:scale-100",
            TAG_SEGMENT_SHADOW,
          )}
        >
          {atMaxColors ? (
            <X className="size-[18px] text-[#707275]" strokeWidth={1.5} />
          ) : (
            <Plus className="size-5 text-[#707275]" strokeWidth={1.5} />
          )}
        </button>
      </div>

      <AnimatePresence>
        {hovered && !open && !hasSelection ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: "top left" }}
            className="pointer-events-none absolute left-0 top-full z-50 mt-2 whitespace-nowrap rounded-lg bg-[#1f2123] px-2.5 py-1.5 text-xs font-medium text-white shadow-[0_6px_20px_-6px_rgba(0,0,0,0.35)]"
          >
            Search by colour
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Picker panel */}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: "top left" }}
            className="absolute left-0 top-full z-50 mt-2 w-[240px] overflow-hidden rounded-2xl border border-[#e3e5e8] bg-white shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]"
          >
            <div className="p-3">
              <SvSquare hsv={hsv} onChange={applyHsv} />
              <HueSlider hsv={hsv} onChange={applyHsv} />

              {/* Hex row */}
              <div className="mt-3 flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <ColorSwatch
                    color={current}
                    size="sm"
                    className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2"
                  />
                  <Input
                    value={hexInput}
                    onChange={(e) => onHexChange(e.target.value)}
                    spellCheck={false}
                    className="pl-10 font-mono uppercase tracking-tight"
                    placeholder="#000000"
                    aria-label="Hex colour"
                  />
                </div>
                {hasEyedropper ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={useEyedropper}
                    aria-label="Pick from screen"
                    className="shrink-0"
                  >
                    <Pipette className="size-3.5" />
                  </Button>
                ) : null}
              </div>

              {/* Draft swatches */}
              <div className="mt-3 flex items-center gap-2 px-0.5">
                {draft.map((c, i) => (
                  <ColorSwatch
                    key={`${c}-${i}`}
                    color={c}
                    size="md"
                    active={editIdx === i}
                    onClick={() => editBead(i)}
                    onRemove={() => removeColor(i)}
                  />
                ))}
                {draft.length < MAX_COLORS ? (
                  <button
                    type="button"
                    onClick={addSlot}
                    aria-label="Add another colour"
                    className="flex size-8 items-center justify-center rounded-[7px] border border-dashed border-[#d1d3d6] text-[#9a9a9d] transition-colors hover:border-[#1f2123] hover:text-[#1f2123] active:scale-[0.96] motion-reduce:active:scale-100"
                  >
                    <Plus className="size-4" strokeWidth={2.2} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="border-t border-[#e3e5e8] bg-[#fafafa] px-3 py-2.5">
              <Button
                type="button"
                onClick={onSearch}
                size="sm"
                className="h-8 w-full rounded-xl bg-[#1f2123] text-sm font-medium tracking-tight text-white hover:bg-[#2c2f31]"
              >
                Search
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ── saturation / value square ──────────────────────────────────────────── */
function SvSquare({ hsv, onChange }: { hsv: HSV; onChange: (h: HSV) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  const pick = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const v = Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height));
      onChange({ h: hsv.h, s, v });
    },
    [hsv.h, onChange],
  );

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Saturation and brightness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsv.s * 100)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX, e.clientY);
      }}
      className="relative aspect-[4/3] w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl ring-1 ring-inset ring-black/8"
      style={{
        backgroundColor: `hsl(${hsv.h} 100% 50%)`,
        backgroundImage:
          "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
      }}
    >
      <span
        className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hsvToHex(hsv) }}
      />
    </div>
  );
}

/* ── hue slider ─────────────────────────────────────────────────────────── */
function HueSlider({ hsv, onChange }: { hsv: HSV; onChange: (h: HSV) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  const pick = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      onChange({ h: t * 360, s: hsv.s, v: hsv.v });
    },
    [hsv.s, hsv.v, onChange],
  );

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hsv.h)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX);
      }}
      className="relative mt-2.5 h-3 w-full cursor-pointer touch-none select-none rounded-full ring-1 ring-inset ring-black/8"
      style={{
        backgroundImage:
          "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
      }}
    >
      <span
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
        style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
      />
    </div>
  );
}
