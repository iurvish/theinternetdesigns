"use client";

import { AnimatedSelectionHighlight } from "@/components/animated-selection-highlight";

/** Two lines on mobile, one line from sm up — no <br> so selection rects stay clean. */
function WordmarkLines() {
  return (
    <span className="inline-flex flex-col items-center leading-none sm:inline-flex sm:flex-row sm:items-baseline sm:gap-[0.22em]">
      <span>the internet</span>
      <span>designs</span>
    </span>
  );
}

export function HeroWordmark() {
  return (
    <AnimatedSelectionHighlight>
      <h1
        className="relative grid text-center text-[clamp(2.5rem,15cqw,9.5rem)] font-bold capitalize leading-[1.04] [filter:drop-shadow(0px_2.7px_1.5px_#0000000A)_drop-shadow(0px_0.8px_0.5px_#0000000C)_drop-shadow(0px_0.8px_0.5px_#00000020)] sm:text-[clamp(2rem,9cqw,9.5rem)] sm:leading-none sm:whitespace-nowrap lg:[filter:drop-shadow(0px_3px_1.5px_#0000000D)_drop-shadow(0px_1px_0.5px_#0000000F)_drop-shadow(0px_1px_0.5px_#00000026)]"
        style={{
          fontFamily: "var(--font-sans)",
          letterSpacing: "-0.04em",
        }}
      >
        {/* Stroke layer — not selectable */}
        <span
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 select-none"
          style={{ color: "#fcfcfc", WebkitTextStroke: "1.2px #D1D1D1B3" }}
        >
          <WordmarkLines />
        </span>
        {/* Gradient fill — sole selectable layer */}
        <span
          className="col-start-1 row-start-1 select-text"
          style={{
            backgroundImage: "linear-gradient(180deg, #fafafa 0%, #ffffff 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
            WebkitTextFillColor: "transparent",
          }}
        >
          <WordmarkLines />
        </span>
      </h1>
    </AnimatedSelectionHighlight>
  );
}
