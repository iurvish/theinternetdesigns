"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pipette, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_COLORS = 2;
const CRISP =
  "shadow-[0px_0px_0px_1px_rgba(232,232,232,0.6),0px_3px_9px_0px_rgba(0,0,0,0.02),0px_1px_1px_0px_rgba(0,0,0,0.04)]";
const POPOVER_SHADOW =
  "shadow-[0px_0px_0px_1px_rgba(0,0,0,0.06),0px_2px_6px_-2px_rgba(0,0,0,0.08),0px_14px_36px_-10px_rgba(0,0,0,0.22)]";
// Selected-colour "bead": an outer drop shadow lifts it off the card, and paired
// inset highlight/shadow give it a physical, pressed-in look (per the Figma).
const BEAD_SHADOW =
  "0 1px 2px rgba(0,0,0,0.18), 0 3px 8px -2px rgba(0,0,0,0.16), inset 0 1px 1.5px rgba(255,255,255,0.45), inset 0 -2px 3px rgba(0,0,0,0.22)";

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

/* ── the control ────────────────────────────────────────────────────────── */
export function ColorSearch({
  selected,
  onSelected,
}: {
  /** Committed colours driving the feed (controlled by the parent). */
  selected: string[];
  onSelected: (colors: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hsv, setHsv] = useState<HSV>({ h: 145, s: 0.55, v: 0.87 });
  const [hexInput, setHexInput] = useState(() => hsvToHex({ h: 145, s: 0.55, v: 0.87 }));
  // Draft beads live only inside the popover — picking a colour adds it here for
  // preview, but nothing filters the feed until the Search button is clicked.
  const [draft, setDraft] = useState<string[]>(selected);
  const [editIdx, setEditIdx] = useState(selected.length);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = hsvToHex(hsv);
  const hasSelection = selected.length > 0;

  // Synchronous mirrors of the draft + active slot, so a fast SV drag can't race
  // itself into appending duplicate beads.
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

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  /** Write the picked colour into the active draft slot — appends on the first
   *  change (or after +), otherwise updates the slot in place. Preview only. */
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

  /** + seeds a fresh slot with the current colour (a new bead you then fine-tune). */
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
  /** Tap a bead to bring it back onto the picker and keep editing it. */
  const editBead = (idx: number) => {
    setEdit(idx);
    const parsed = hexToHsv(draft[idx]);
    if (parsed) {
      setHsv(parsed);
      setHexInput(draft[idx]);
    }
  };
  /** Clear from the trigger pill — an explicit action, so this does drop the feed. */
  const clearAll = () => {
    writeDraft([]);
    setEdit(0);
    onSelected([]);
  };
  const openPicker = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Seed the draft (and picker) from what's currently committed.
    writeDraft(selected);
    setEdit(selected.length);
    if (selected.length) {
      const parsed = hexToHsv(selected[selected.length - 1]);
      if (parsed) {
        setHsv(parsed);
        setHexInput(selected[selected.length - 1]);
      }
    }
    setOpen(true);
    setHovered(false);
  };
  /** The one place the feed actually updates. */
  const onSearch = () => {
    const arr = draftRef.current.length ? draftRef.current : [current];
    onSelected(arr);
    setOpen(false);
  };
  const draftCount = draft.length || 1;

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

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger — dots glyph (or committed swatches) + a `+` hint so it reads as
          "pick colours", plus a quick clear when a search is active. */}
      <div
        className={cn(
          "group flex items-center gap-1 rounded-xl bg-white py-2 transition-transform",
          hasSelection ? "pl-2.5 pr-1.5" : "px-2.5",
          CRISP,
        )}
      >
        <button
          type="button"
          onClick={openPicker}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-label="Search by colour"
          className="flex items-center gap-1.5 active:scale-[0.97] motion-reduce:active:scale-100"
        >
          {hasSelection ? (
            <span className="flex items-center">
              {selected.map((c, i) => (
                <span
                  key={c}
                  className="size-[18px] rounded-full ring-2 ring-white"
                  style={{ backgroundColor: c, marginLeft: i === 0 ? 0 : -6 }}
                />
              ))}
            </span>
          ) : (
            <ColorDotsIcon className="size-[18px]" />
          )}
          {selected.length < MAX_COLORS ? (
            <Plus className="size-3.5 text-[#adadb0]" strokeWidth={2.4} aria-hidden />
          ) : null}
        </button>
        {hasSelection ? (
          <button
            type="button"
            onClick={clearAll}
            aria-label="Clear colour search"
            className="flex size-5 items-center justify-center rounded-full text-[#9a9a9d] opacity-0 transition-[opacity,colors] hover:bg-[#f0f0f1] hover:text-[#1f2123] focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X className="size-3.5" strokeWidth={2.4} />
          </button>
        ) : null}
      </div>

      {/* Hover tooltip (only while closed and nothing selected) */}
      <AnimatePresence>
        {hovered && !open && !hasSelection ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: "top left" }}
            className="pointer-events-none absolute left-0 top-full z-50 mt-2 flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1f2123] px-2.5 py-1.5 text-xs font-medium text-white shadow-[0_6px_20px_-6px_rgba(0,0,0,0.35)]"
          >
            <ColorDotsIcon className="size-3.5" />
            Search by colour
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Picker popover */}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: "top left" }}
            // Plain rounded rectangle — no bottom sweep.
            className={cn(
              "absolute left-0 top-full z-50 mt-2 w-[256px] rounded-[24px] bg-white px-4 pb-4 pt-4",
              POPOVER_SHADOW,
            )}
          >
            {/* Micro-label sets the hierarchy (uppercase, tracked out per the
                typography guidance) with the live hex on the right. */}
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#9a9a9d]">
                Colour
              </span>
              <span className="font-mono text-[11px] tabular-nums tracking-tight text-[#adadb0]">
                {current}
              </span>
            </div>

            {/* Square saturation/value field + straight hue bar (no circle, no curve). */}
            <SvSquare hsv={hsv} onChange={applyHsv} />
            <HueSlider hsv={hsv} onChange={applyHsv} />

            {/* hex + eyedropper */}
            <div className="mt-4 flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-[#e8e8e8] px-2.5 py-2 transition-colors focus-within:border-[#c7c7ca]">
                <span
                  className="size-4 shrink-0 rounded-[5px]"
                  style={{ backgroundColor: current, boxShadow: BEAD_SHADOW }}
                />
                <input
                  value={hexInput}
                  onChange={(e) => onHexChange(e.target.value)}
                  spellCheck={false}
                  className="w-full bg-transparent font-mono text-sm tracking-tight text-[#1f2123] outline-none placeholder:text-[#adadb0]"
                  placeholder="#000000"
                  aria-label="Hex colour"
                />
              </div>
              {hasEyedropper ? (
                <button
                  type="button"
                  onClick={useEyedropper}
                  aria-label="Pick from screen"
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#e8e8e8] text-[#5c5c5e] transition-[colors,transform] hover:bg-[#f4f4f5] active:scale-[0.96] motion-reduce:active:scale-100"
                >
                  <Pipette className="size-4" />
                </button>
              ) : null}
            </div>

            {/* Draft beads — the picked colour previews here (feed still unchanged).
                Tap a bead to keep editing it; the badge removes it; `+` adds a 2nd. */}
            <div className="mt-4 flex items-center gap-2.5">
              {draft.map((c, i) => (
                <div key={`${c}-${i}`} className="group relative">
                  <button
                    type="button"
                    onClick={() => editBead(i)}
                    aria-label={`Edit ${c}`}
                    className="size-9 rounded-[10px] transition-transform active:scale-[0.96] motion-reduce:active:scale-100"
                    style={{
                      backgroundColor: c,
                      boxShadow: BEAD_SHADOW,
                      outline: editIdx === i ? "2px solid #1f2123" : "none",
                      outlineOffset: 2,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeColor(i)}
                    aria-label={`Remove ${c}`}
                    className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-[#1f2123] text-white opacity-0 shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition group-hover:opacity-100"
                  >
                    <X className="size-2.5" strokeWidth={3} />
                  </button>
                </div>
              ))}
              {draft.length < MAX_COLORS ? (
                <button
                  type="button"
                  onClick={addSlot}
                  aria-label="Add another colour"
                  className="flex size-9 items-center justify-center rounded-[10px] border-2 border-dashed border-[#d2d2d5] text-[#9a9a9d] transition-colors hover:border-[#1f2123] hover:text-[#1f2123]"
                >
                  <Plus className="size-4" strokeWidth={2.4} />
                </button>
              ) : null}
            </div>

            {/* The only control that runs the search + closes. */}
            <button
              type="button"
              onClick={onSearch}
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-[#1f2123] py-2.5 text-sm font-medium tracking-tight text-white transition-[colors,transform] hover:bg-[#2c2f31] active:scale-[0.98] motion-reduce:active:scale-100"
            >
              {`Search ${draftCount} colour${draftCount > 1 ? "s" : ""}`}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ── saturation / value square ──────────────────────────────────────────── */
// x = saturation (0→1 left→right), y = value (1→0 top→bottom), hue = background.
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
      className="relative aspect-[4/3] w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
      style={{
        backgroundColor: `hsl(${hsv.h} 100% 50%)`,
        backgroundImage:
          "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
      }}
    >
      <span
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_1px_4px_-1px_rgba(0,0,0,0.4)]"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hsvToHex(hsv) }}
      />
    </div>
  );
}

/* ── straight hue slider ─────────────────────────────────────────────────── */
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
      className="relative mt-3 h-3.5 w-full cursor-pointer touch-none select-none rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
      style={{
        backgroundImage:
          "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
      }}
    >
      <span
        className="pointer-events-none absolute top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.15),0_1px_4px_-1px_rgba(0,0,0,0.4)]"
        style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
      />
    </div>
  );
}
