"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_SIZE = 30;
const NAV_EXPANDED_W = 82;

/** Paper node CB-0 — frosted media nav (feed cards) */
const NAV_PILL_SURFACE =
  "flex h-[30px] items-center justify-center overflow-clip bg-[#C4C4C5A6] backdrop-blur-[8px] [background-image:linear-gradient(180deg,rgba(255,255,255,0.01)_0%,transparent_100%)] shadow-[inset_0_2px_8px_rgba(228,228,228,0.25),inset_0_0_53px_1px_rgba(148,148,148,0.25),0_0_0_0.3px_rgba(0,0,0,0.06),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_rgba(0,0,0,0.04)]";

/** Paper node CL-0 — open / external affordance */
export const NAV_OPEN_AFFORDANCE_CLASS =
  "bg-[#C4C4C5A6] backdrop-blur-[8px] [background-image:linear-gradient(180deg,rgba(255,255,255,0.04)_0%,transparent_100%)] shadow-[inset_0_2px_8px_rgba(228,228,232,0.25),inset_0_0_53px_1px_rgba(148,148,148,0.25),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_rgba(0,0,0,0.04)]";

const NAV_SPRING = { type: "spring", duration: 0.34, bounce: 0.22 } as const;

const SHAKE_ANIMATE = { x: [0, -5, 5, -4, 4, -2, 0] };
const SHAKE_TRANSITION = { duration: 0.42, ease: [0.36, 0.07, 0.19, 0.97] as const };

const OVERLAY_BTN =
  "relative flex size-[38px] shrink-0 items-center justify-center overflow-clip rounded-full bg-[#1f2123] text-white shadow-[0_2px_10px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.14)] transition-[transform,background-color] duration-150 hover:bg-[#2a2c2e] active:scale-95 motion-reduce:active:scale-100";

const OVERLAY_BADGE =
  "relative flex h-[38px] min-w-[38px] shrink-0 items-center justify-center overflow-clip rounded-full bg-[#1f2123] px-3.5 text-white shadow-[0_2px_10px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.14)]";

function SolidShine() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
    />
  );
}

function BoundaryDot() {
  return <span className="size-2 rounded-full bg-white/25" aria-hidden />;
}

function NavTip({ text, show }: { text: string; show: boolean }) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.96 }}
          transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[180px] -translate-x-1/2 rounded-lg bg-[#1f2123]/95 px-2.5 py-1.5 text-center text-[11px] font-medium leading-tight tracking-tight text-white shadow-[0_6px_20px_-6px_rgba(0,0,0,0.45)] backdrop-blur-sm"
        >
          {text}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function NavArrow({
  side,
  show,
  atBoundary,
  onClick,
}: {
  side: "left" | "right";
  show: boolean;
  atBoundary: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;

  return (
    <motion.button
      type="button"
      aria-label={
        atBoundary
          ? side === "left"
            ? "No previous"
            : "No next"
          : side === "left"
            ? "Previous"
            : "Next"
      }
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      initial={false}
      animate={{ width: show ? 24 : 0, opacity: show ? 1 : 0 }}
      transition={NAV_SPRING}
      className={cn(
        "flex h-[24px] shrink-0 items-center justify-center overflow-clip rounded-[18px] p-0.5",
        !atBoundary &&
          "transition-[background-color,box-shadow] duration-150 hover:bg-[#B7B7B8] hover:shadow-[inset_0_2px_8px_rgba(228,228,228,0.25),inset_0_0_53px_1px_rgba(200,200,200,0.25)]",
      )}
    >
      {atBoundary ? (
        <BoundaryDot />
      ) : (
        <Icon className="size-4 shrink-0 text-[#fefefe]" strokeWidth={2.4} />
      )}
    </motion.button>
  );
}

/** Feed card — circle count at rest, pill + arrows on card hover. */
export function FeedMediaNav({
  count,
  index,
  hovered,
  onPrev,
  onNext,
  className,
}: {
  count: number;
  index: number;
  hovered: boolean;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}) {
  const [shake, setShake] = useState(false);

  const bump = (atBoundary: boolean, action: () => void) => {
    if (atBoundary) {
      setShake(true);
      window.setTimeout(() => setShake(false), 420);
      return;
    }
    action();
  };

  const atStart = index === 0;
  const atEnd = index >= count - 1;

  return (
    <motion.div
      onClick={(e) => e.stopPropagation()}
      initial={false}
      animate={{
        width: hovered ? NAV_EXPANDED_W : NAV_SIZE,
        borderRadius: hovered ? 23 : NAV_SIZE / 2,
        x: shake ? [0, -5, 5, -4, 4, -2, 0] : 0,
      }}
      transition={shake ? SHAKE_TRANSITION : NAV_SPRING}
      className={cn(
        "pointer-events-auto absolute right-2.5 top-2.5 gap-2 px-[3px]",
        NAV_PILL_SURFACE,
        className,
      )}
    >
      <NavArrow
        side="left"
        show={hovered}
        atBoundary={atStart}
        onClick={() => bump(atStart, onPrev)}
      />
      <span
        className={cn(
          "shrink-0 text-center font-medium tabular-nums tracking-[-0.02em] text-white",
          hovered ? "min-w-[8px] text-[15px] leading-none" : "text-[15px] leading-none",
        )}
      >
        {hovered ? index + 1 : count}
      </span>
      <NavArrow
        side="right"
        show={hovered}
        atBoundary={atEnd}
        onClick={() => bump(atEnd, onNext)}
      />
    </motion.div>
  );
}

function OverlayNavArrow({
  side,
  atBoundary,
  tip,
  showTip,
  onClick,
  onHover,
  onLeave,
}: {
  side: "left" | "right";
  atBoundary: boolean;
  tip: string;
  showTip: boolean;
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      className="relative"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <NavTip text={tip} show={showTip && !atBoundary} />
      <button
        type="button"
        aria-label={
          atBoundary
            ? side === "left"
              ? "No previous"
              : "No next"
            : side === "left"
              ? "Previous"
              : "Next"
        }
        onClick={onClick}
        className={OVERLAY_BTN}
      >
        <SolidShine />
        {atBoundary ? (
          <BoundaryDot />
        ) : side === "left" ? (
          <ChevronLeft className="relative z-[1] size-5 text-white" strokeWidth={2.5} />
        ) : (
          <ChevronRight className="relative z-[1] size-5 text-white" strokeWidth={2.5} />
        )}
      </button>
    </div>
  );
}

function OverlayNavBadge({ children }: { children: ReactNode }) {
  return (
    <div className={OVERLAY_BADGE}>
      <SolidShine />
      <span className="relative z-[1] text-[15px] font-medium leading-none tabular-nums tracking-[-0.02em] text-white">
        {children}
      </span>
    </div>
  );
}

/** Fullscreen overlay — solid arrows + optional media counter. */
export function OverlayMediaNav({
  mediaLabel,
  shake,
  atStart,
  atEnd,
  onBack,
  onForward,
  className,
}: {
  mediaLabel: string | null;
  shake?: boolean;
  atStart?: boolean;
  atEnd?: boolean;
  onBack: () => void;
  onForward: () => void;
  className?: string;
}) {
  const [tipsHidden, setTipsHidden] = useState(false);
  const [hoverSide, setHoverSide] = useState<"left" | "right" | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissTips = useCallback(() => {
    setTipsHidden(true);
    setHoverSide(null);
  }, []);

  const handleClick = (action: () => void) => {
    dismissTips();
    action();
  };

  const handleHover = (side: "left" | "right") => {
    if (tipsHidden) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHoverSide(side), 380);
  };

  const handleLeave = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHoverSide(null);
  };

  return (
    <motion.div
      animate={shake ? SHAKE_ANIMATE : { x: 0 }}
      transition={shake ? SHAKE_TRANSITION : { duration: 0.15 }}
      className={cn("flex items-center gap-4 sm:gap-5", className)}
    >
      <OverlayNavArrow
        side="left"
        atBoundary={!!atStart}
        tip="Tap or press ←"
        showTip={hoverSide === "left"}
        onClick={() => handleClick(onBack)}
        onHover={() => handleHover("left")}
        onLeave={handleLeave}
      />

      {mediaLabel ? <OverlayNavBadge>{mediaLabel}</OverlayNavBadge> : null}

      <OverlayNavArrow
        side="right"
        atBoundary={!!atEnd}
        tip="Tap or press →"
        showTip={hoverSide === "right"}
        onClick={() => handleClick(onForward)}
        onHover={() => handleHover("right")}
        onLeave={handleLeave}
      />
    </motion.div>
  );
}

/** Media counter only — post totals are omitted everywhere. */
export function overlayNavLabels(opts: {
  mediaIndex: number;
  mediaCount: number;
}): string | null {
  const { mediaIndex, mediaCount } = opts;
  return mediaCount > 1 ? `${mediaIndex + 1}/${mediaCount}` : null;
}
