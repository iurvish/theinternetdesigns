"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Pipette, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_COLORS = 5;
const CRISP =
  "shadow-[0px_0px_0px_1px_rgba(232,232,232,0.6),0px_3px_9px_0px_rgba(0,0,0,0.02),0px_1px_1px_0px_rgba(0,0,0,0.04)]";
const POPOVER_SHADOW =
  "shadow-[0px_0px_0px_1px_rgba(0,0,0,0.06),0px_2px_6px_-2px_rgba(0,0,0,0.08),0px_14px_36px_-10px_rgba(0,0,0,0.22)]";

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
    [r, g, b]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("")
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
export function ColorSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hsv, setHsv] = useState<HSV>({ h: 145, s: 0.55, v: 0.87 });
  const [hexInput, setHexInput] = useState(() => hsvToHex({ h: 145, s: 0.55, v: 0.87 }));
  const [selected, setSelected] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = hsvToHex(hsv);

  const applyHsv = useCallback((next: HSV) => {
    setHsv(next);
    setHexInput(hsvToHex(next));
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

  const addColor = () => {
    setSelected((s) =>
      s.includes(current) || s.length >= MAX_COLORS ? s : [...s, current],
    );
  };
  const removeColor = (c: string) => setSelected((s) => s.filter((x) => x !== c));

  const onHexChange = (raw: string) => {
    setHexInput(raw);
    const parsed = hexToHsv(raw);
    if (parsed) setHsv(parsed);
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

  const hasEyedropper =
    typeof window !== "undefined" && "EyeDropper" in window;

  const runSearch = () => {
    if (selected.length === 0) return;
    setOpen(false);
    const param = selected.map((c) => c.replace("#", "")).join(",");
    router.push(`/search?colors=${param}`);
  };

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger — colour-dots only, or the selected colours */}
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setHovered(false);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="Search by colour"
        className={cn(
          "flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-2.5 transition-transform active:scale-[0.97] motion-reduce:active:scale-100",
          CRISP,
        )}
      >
        {selected.length > 0 ? (
          <span className="flex items-center">
            {selected.slice(0, 4).map((c, i) => (
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
      </button>

      {/* Hover tooltip (only while closed) */}
      <AnimatePresence>
        {hovered && !open ? (
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
            className={cn(
              "absolute left-0 top-full z-50 mt-2 w-[248px] rounded-2xl bg-white p-3",
              POPOVER_SHADOW,
            )}
          >
            <Wheel hsv={hsv} onChange={applyHsv} />
            <ValueSlider hsv={hsv} onChange={applyHsv} />

            {/* hex + eyedropper */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-[#e8e8e8] px-2.5 py-2">
                <span
                  className="size-4 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: current }}
                />
                <input
                  value={hexInput}
                  onChange={(e) => onHexChange(e.target.value)}
                  spellCheck={false}
                  className="w-full bg-transparent text-sm tracking-tight text-[#1f2123] outline-none placeholder:text-[#adadb0]"
                  placeholder="#000000"
                  aria-label="Hex colour"
                />
              </div>
              {hasEyedropper ? (
                <button
                  type="button"
                  onClick={useEyedropper}
                  aria-label="Pick from screen"
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#e8e8e8] text-[#5c5c5e] transition-colors hover:bg-[#f4f4f5]"
                >
                  <Pipette className="size-4" />
                </button>
              ) : null}
            </div>

            {/* selected colours + add */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {selected.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => removeColor(c)}
                  aria-label={`Remove ${c}`}
                  className="group relative size-7 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: c }}
                >
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                    <X className="size-3.5 text-white" strokeWidth={2.5} />
                  </span>
                </button>
              ))}
              {selected.length < MAX_COLORS ? (
                <button
                  type="button"
                  onClick={addColor}
                  aria-label="Add this colour"
                  className="flex size-7 items-center justify-center rounded-full border border-dashed border-[#cfcfd2] text-[#9a9a9d] transition-colors hover:border-[#1f2123] hover:text-[#1f2123]"
                >
                  <Plus className="size-4" strokeWidth={2.2} />
                </button>
              ) : null}
            </div>

            {/* search */}
            <button
              type="button"
              onClick={runSearch}
              disabled={selected.length === 0}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1f2123] py-2.5 text-sm font-medium tracking-tight text-white transition-colors hover:bg-[#2c2f31] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="size-4" strokeWidth={2.4} />
              {selected.length > 0
                ? `Search ${selected.length} colour${selected.length > 1 ? "s" : ""}`
                : "Pick a colour"}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ── hue/saturation wheel ───────────────────────────────────────────────── */
function Wheel({ hsv, onChange }: { hsv: HSV; onChange: (h: HSV) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  const pick = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const maxR = r.width / 2;
      const dist = Math.min(Math.hypot(dx, dy), maxR);
      // hue = clockwise angle from top; sat = radius
      let h = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (h < 0) h += 360;
      onChange({ h, s: maxR === 0 ? 0 : dist / maxR, v: hsv.v });
    },
    [hsv.v, onChange],
  );

  // Positioned in percentages so it's correct at any rendered size (no measuring).
  const rad = (hsv.h * Math.PI) / 180;
  const knob = {
    left: 50 + Math.sin(rad) * hsv.s * 50,
    top: 50 - Math.cos(rad) * hsv.s * 50,
  };

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Hue and saturation"
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX, e.clientY);
      }}
      className="relative mx-auto aspect-square w-full cursor-crosshair touch-none select-none rounded-full ring-1 ring-black/5"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #fff 0%, rgba(255,255,255,0) 70%), conic-gradient(from 0deg, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
      }}
    >
      <span
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${knob.left}%`, top: `${knob.top}%`, backgroundColor: hsvToHex(hsv) }}
      />
    </div>
  );
}

/* ── brightness (value) slider ──────────────────────────────────────────── */
function ValueSlider({ hsv, onChange }: { hsv: HSV; onChange: (h: HSV) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const full = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 });

  const pick = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const t = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
      onChange({ h: hsv.h, s: hsv.s, v: t });
    },
    [hsv.h, hsv.s, onChange],
  );

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Brightness"
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX);
      }}
      className="relative mt-3 h-3.5 w-full cursor-pointer touch-none select-none rounded-full ring-1 ring-inset ring-black/10"
      style={{ background: `linear-gradient(to right, #000, ${full})` }}
    >
      <span
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${hsv.v * 100}%`, backgroundColor: hsvToHex(hsv) }}
      />
    </div>
  );
}
