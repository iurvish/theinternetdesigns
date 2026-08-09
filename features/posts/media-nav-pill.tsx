"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_SIZE = 30;
const NAV_EXPANDED_W = 82;

/** Paper node CB-0 — frosted media nav */
const NAV_PILL_SURFACE =
  "flex h-[30px] items-center justify-center overflow-clip bg-[#C4C4C5A6] backdrop-blur-[8px] [background-image:linear-gradient(180deg,rgba(255,255,255,0.01)_0%,transparent_100%)] shadow-[inset_0_2px_8px_rgba(228,228,228,0.25),inset_0_0_53px_1px_rgba(148,148,148,0.25),0_0_0_0.3px_rgba(0,0,0,0.06),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_rgba(0,0,0,0.04)]";

/** Expanded pill (overlay) */
export const NAV_PILL_CLASS = cn(NAV_PILL_SURFACE, "rounded-[23px] p-[3px] gap-2.5");

/** Paper node CL-0 — open / external affordance */
export const NAV_OPEN_AFFORDANCE_CLASS =
  "bg-[#C4C4C5A6] backdrop-blur-[8px] [background-image:linear-gradient(180deg,rgba(255,255,255,0.04)_0%,transparent_100%)] shadow-[inset_0_2px_8px_rgba(228,228,228,0.25),inset_0_0_53px_1px_rgba(148,148,148,0.25),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_rgba(0,0,0,0.04)]";

const NAV_SPRING = { type: "spring", duration: 0.34, bounce: 0.22 } as const;

const SHAKE_ANIMATE = { x: [0, -5, 5, -4, 4, -2, 0] };
const SHAKE_TRANSITION = { duration: 0.42, ease: [0.36, 0.07, 0.19, 0.97] as const };

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
  const Icon = atBoundary ? Minus : side === "left" ? ChevronLeft : ChevronRight;

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
      <Icon
        className={cn(
          "shrink-0 text-[#fefefe]",
          atBoundary ? "size-3.5 text-white/35" : "size-4",
        )}
        strokeWidth={atBoundary ? 2.2 : 2.4}
      />
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

/** Overlay — arrows always visible; parent drives shake at boundaries. */
export function OverlayMediaNav({
  label,
  shake,
  atStart,
  atEnd,
  onBack,
  onForward,
  className,
}: {
  label: string | null;
  shake?: boolean;
  atStart?: boolean;
  atEnd?: boolean;
  onBack: () => void;
  onForward: () => void;
  className?: string;
}) {
  return (
    <motion.div
      animate={shake ? SHAKE_ANIMATE : { x: 0 }}
      transition={shake ? SHAKE_TRANSITION : { duration: 0.15 }}
      className={cn(NAV_PILL_CLASS, className)}
    >
      <button
        type="button"
        aria-label={atStart ? "No previous" : "Previous"}
        onClick={onBack}
        className={cn(
          "flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[18px] p-0.5 active:scale-95 motion-reduce:active:scale-100",
          !atStart &&
            "transition-[background-color,box-shadow] duration-150 hover:bg-[#B7B7B8] hover:shadow-[inset_0_2px_8px_rgba(228,228,228,0.25),inset_0_0_53px_1px_rgba(200,200,200,0.25)]",
        )}
      >
        {atStart ? (
          <Minus className="size-3.5 text-white/35" strokeWidth={2.2} />
        ) : (
          <ChevronLeft className="size-4 text-[#fefefe]" strokeWidth={2.4} />
        )}
      </button>
      {label ? (
        <span className="min-w-[8px] shrink-0 text-center text-[15px] font-medium leading-none tabular-nums tracking-[-0.02em] text-white">
          {label}
        </span>
      ) : null}
      <button
        type="button"
        aria-label={atEnd ? "No next" : "Next"}
        onClick={onForward}
        className={cn(
          "flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[18px] p-0.5 active:scale-95 motion-reduce:active:scale-100",
          !atEnd &&
            "transition-[background-color,box-shadow] duration-150 hover:bg-[#B7B7B8] hover:shadow-[inset_0_2px_8px_rgba(228,228,228,0.25),inset_0_0_53px_1px_rgba(200,200,200,0.25)]",
        )}
      >
        {atEnd ? (
          <Minus className="size-3.5 text-white/35" strokeWidth={2.2} />
        ) : (
          <ChevronRight className="size-4 text-[#fefefe]" strokeWidth={2.4} />
        )}
      </button>
    </motion.div>
  );
}
