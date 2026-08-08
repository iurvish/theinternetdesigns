"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";

type Rect = {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
};

const MIN_RECT_SIZE = 2;
const LINE_TOLERANCE = 4;
const MERGE_GAP = 14;

type RawRect = Omit<Rect, "id">;

function mergeClientRects(rects: RawRect[]): RawRect[] {
  if (rects.length <= 1) return rects;

  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const merged: RawRect[] = [];

  for (const r of sorted) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      Math.abs(prev.top - r.top) <= LINE_TOLERANCE &&
      Math.abs(prev.height - r.height) <= LINE_TOLERANCE
    ) {
      const gap = r.left - (prev.left + prev.width);
      if (gap <= MERGE_GAP) {
        const right = Math.max(prev.left + prev.width, r.left + r.width);
        const bottom = Math.max(prev.top + prev.height, r.top + r.height);
        prev.left = Math.min(prev.left, r.left);
        prev.top = Math.min(prev.top, r.top);
        prev.width = right - prev.left;
        prev.height = bottom - prev.top;
        continue;
      }
    }
    merged.push({ ...r });
  }

  return merged;
}

export function AnimatedSelectionHighlight({
  children,
  isDark = false,
}: {
  children: ReactNode;
  isDark?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [rects, setRects] = useState<Rect[]>([]);
  const [pulses, setPulses] = useState<
    { id: number; x: number; y: number; rects: Rect[] }[]
  >([]);
  const [isDragging, setIsDragging] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const getRelativeRects = useCallback((selection: Selection | null) => {
    const root = containerRef.current;
    if (
      !root ||
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0 ||
      !selection.anchorNode ||
      !root.contains(selection.anchorNode)
    ) {
      return [];
    }
    const range = selection.getRangeAt(0);
    const containerBox = root.getBoundingClientRect();
    const raw = Array.from(range.getClientRects())
      .filter((r) => r.width > MIN_RECT_SIZE && r.height > MIN_RECT_SIZE)
      .map((r) => ({
        top: r.top - containerBox.top,
        left: r.left - containerBox.left,
        width: r.width,
        height: r.height,
      }));

    return mergeClientRects(raw).map((r, i) => ({
      ...r,
      id: `${Date.now()}-${i}`,
    }));
  }, []);

  useEffect(() => {
    const handleResize = () =>
      setRects(getRelativeRects(window.getSelection()));
    window.addEventListener("resize", handleResize);
    const root = containerRef.current;
    let ro: ResizeObserver | undefined;
    if (root) {
      ro = new ResizeObserver(handleResize);
      ro.observe(root);
    }
    return () => {
      window.removeEventListener("resize", handleResize);
      ro?.disconnect();
    };
  }, [getRelativeRects]);

  const triggerPulse = useCallback(
    (x: number, y: number, selection: Selection | null) => {
      const activeRects = getRelativeRects(selection);
      if (activeRects.length === 0) return;
      const newPulse = {
        id: Date.now() + Math.random(),
        x,
        y,
        rects: activeRects,
      };
      setPulses((prev) => [...prev, newPulse]);
      setTimeout(
        () => setPulses((prev) => prev.filter((p) => p.id !== newPulse.id)),
        750,
      );
    },
    [getRelativeRects],
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const handleSelectionChange = () =>
      setRects(getRelativeRects(window.getSelection()));

    const handlePointerDown = (e: PointerEvent) => {
      isDraggingRef.current = true;
      setIsDragging(true);
      const b = root.getBoundingClientRect();
      const rx = e.clientX - b.left;
      const ry = e.clientY - b.top;
      setCursorPos({ x: rx, y: ry });
      triggerPulse(rx, ry, window.getSelection());
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const b = root.getBoundingClientRect();
      setCursorPos({ x: e.clientX - b.left, y: e.clientY - b.top });
    };

    const handlePointerUp = (e: PointerEvent) => {
      isDraggingRef.current = false;
      setIsDragging(false);
      setCursorPos(null);
      const b = root.getBoundingClientRect();
      triggerPulse(
        e.clientX - b.left,
        e.clientY - b.top,
        window.getSelection(),
      );
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "a" && !e.key.includes("Arrow")) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0).getBoundingClientRect();
      const b = root.getBoundingClientRect();
      triggerPulse(r.right - b.left, r.bottom - b.top, sel);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    root.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      root.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [getRelativeRects, triggerPulse]);

  return (
    <div ref={containerRef} className="relative" data-selection-highlight>
      <style>{`
        [data-selection-highlight] .no-native-select,
        [data-selection-highlight] .no-native-select * {
          -webkit-tap-highlight-color: transparent;
        }
        [data-selection-highlight] .selection-fill::selection {
          background: rgba(3, 145, 255, 0.35) !important;
          color: #fafafa !important;
          -webkit-text-fill-color: #fafafa !important;
        }
        [data-selection-highlight] .selection-fill::-moz-selection {
          background: rgba(3, 145, 255, 0.35) !important;
          color: #fafafa !important;
        }
        [data-selection-highlight] .no-native-select::selection,
        [data-selection-highlight] .no-native-select *::selection {
          background: rgba(3, 145, 255, 0.35) !important;
          color: #fafafa !important;
          -webkit-text-fill-color: #fafafa !important;
        }
        [data-selection-highlight] .no-native-select::-moz-selection,
        [data-selection-highlight] .no-native-select *::-moz-selection {
          background: rgba(3, 145, 255, 0.35) !important;
          color: #fafafa !important;
        }
      `}</style>

      {/* Pulse/drag overlays only — base tint comes from styled ::selection */}
      {isDragging &&
        cursorPos &&
        rects.map((r) => (
          <div
            key={`drag-${r.id}`}
            className="pointer-events-none absolute z-[3] rounded-[3px]"
            style={{
              top: r.top,
              left: r.left,
              width: r.width,
              height: r.height,
              background: `radial-gradient(circle 60px at ${cursorPos.x - r.left}px ${cursorPos.y - r.top}px, rgba(73,255,255,0.8) 0%, rgba(73,255,255,0.3) 40%, rgba(73,255,255,0) 100%)`,
            }}
          />
        ))}

      <AnimatePresence>
        {pulses.map((pulse) =>
          pulse.rects.map((r) => (
            <motion.div
              key={`pulse-${pulse.id}-${r.id}`}
              initial={{ opacity: 0.9 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.75, ease: "easeOut" }}
              className="pointer-events-none absolute z-[4] rounded-[3px]"
              style={{
                top: r.top,
                left: r.left,
                width: r.width,
                height: r.height,
                background: `radial-gradient(circle 1500px at ${pulse.x - r.left}px ${pulse.y - r.top}px, rgba(73,255,255,0.6) 0%, rgba(73,255,255,0.3) 50%, rgba(73,255,255,0) 100%)`,
              }}
            />
          )),
        )}
      </AnimatePresence>

      <div className="no-native-select relative z-[1]">{children}</div>
    </div>
  );
}
