"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Paper node CB-0 — frosted media nav pill */
export const NAV_PILL_CLASS =
  "flex items-center justify-center overflow-clip rounded-[23px] p-[3px] gap-2.5 bg-[#C4C4C5A6] backdrop-blur-[8px] [background-image:linear-gradient(180deg,rgba(255,255,255,0.01)_0%,transparent_100%)] shadow-[inset_0_2px_8px_rgba(228,228,228,0.25),inset_0_0_53px_1px_rgba(148,148,148,0.25),0_0_0_0.3px_rgba(0,0,0,0.06),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_rgba(0,0,0,0.04)]";

/** Paper node CL-0 — open / external affordance */
export const NAV_OPEN_AFFORDANCE_CLASS =
  "bg-[#C4C4C5A6] backdrop-blur-[8px] [background-image:linear-gradient(180deg,rgba(255,255,255,0.04)_0%,transparent_100%)] shadow-[inset_0_2px_8px_rgba(228,228,228,0.25),inset_0_0_53px_1px_rgba(148,148,148,0.25),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_rgba(0,0,0,0.04)]";

const NAV_SPRING = { type: "spring", duration: 0.34, bounce: 0.22 } as const;

const SHAKE_ANIMATE = { x: [0, -5, 5, -4, 4, -2, 0] };
const SHAKE_TRANSITION = { duration: 0.42, ease: [0.36, 0.07, 0.19, 0.97] as const };

function NavArrow({
  side,
  show,
  onClick,
}: {
  side: "left" | "right";
  show: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <motion.button
      type="button"
      aria-label={side === "left" ? "Previous" : "Next"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      initial={false}
      animate={{ width: show ? 24 : 0, opacity: show ? 1 : 0 }}
      transition={NAV_SPRING}
      className="flex h-6 shrink-0 items-center justify-center overflow-clip rounded-[18px] p-1.5 transition-[background-color,box-shadow] duration-150 hover:bg-[#B7B7B8] hover:shadow-[inset_0_2px_8px_rgba(228,228,228,0.25),inset_0_0_53px_1px_rgba(200,200,200,0.25)]"
    >
      <Icon className="size-3 shrink-0 text-[#fefefe]" strokeWidth={2.2} />
    </motion.button>
  );
}

/** Feed card — compact count at rest, chevrons expand on card hover. */
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

  return (
    <motion.div
      onClick={(e) => e.stopPropagation()}
      animate={shake ? SHAKE_ANIMATE : { x: 0 }}
      transition={shake ? SHAKE_TRANSITION : { duration: 0.15 }}
      className={cn("pointer-events-auto absolute right-2.5 top-2.5", NAV_PILL_CLASS, className)}
    >
      <NavArrow
        side="left"
        show={hovered}
        onClick={() => bump(index === 0, onPrev)}
      />
      <span className="min-w-[8px] shrink-0 text-center text-sm font-medium tabular-nums tracking-[-0.015em] text-white">
        {hovered ? index + 1 : count}
      </span>
      <NavArrow
        side="right"
        show={hovered}
        onClick={() => bump(index >= count - 1, onNext)}
      />
    </motion.div>
  );
}

/** Overlay — arrows always visible; parent drives shake at boundaries. */
export function OverlayMediaNav({
  label,
  shake,
  onBack,
  onForward,
  className,
}: {
  label: string | null;
  shake?: boolean;
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
        aria-label="Previous"
        onClick={onBack}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[18px] p-1.5 transition-[background-color,box-shadow] duration-150 hover:bg-[#B7B7B8] hover:shadow-[inset_0_2px_8px_rgba(228,228,228,0.25),inset_0_0_53px_1px_rgba(200,200,200,0.25)] active:scale-95 motion-reduce:active:scale-100"
      >
        <ChevronLeft className="size-3 text-[#fefefe]" strokeWidth={2.2} />
      </button>
      {label ? (
        <span className="min-w-[8px] shrink-0 text-center text-sm font-medium tabular-nums tracking-[-0.015em] text-white">
          {label}
        </span>
      ) : null}
      <button
        type="button"
        aria-label="Next"
        onClick={onForward}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[18px] p-1.5 transition-[background-color,box-shadow] duration-150 hover:bg-[#B7B7B8] hover:shadow-[inset_0_2px_8px_rgba(228,228,228,0.25),inset_0_0_53px_1px_rgba(200,200,200,0.25)] active:scale-95 motion-reduce:active:scale-100"
      >
        <ChevronRight className="size-3 text-[#fefefe]" strokeWidth={2.2} />
      </button>
    </motion.div>
  );
}
