"use client";

import { AnimatedSelectionHighlight } from "@/components/animated-selection-highlight";

function WordmarkText() {
  return (
    <>
      the internet
      <span className="sm:hidden">
        <br />
      </span>
      <span className="hidden sm:inline">&nbsp;</span>
      designs
    </>
  );
}

export function HeroWordmark() {
  return (
    <AnimatedSelectionHighlight>
      <h1
        className="relative grid whitespace-nowrap text-center text-[clamp(2.5rem,15cqw,9.5rem)] font-bold capitalize leading-[1.04] [filter:drop-shadow(0px_2.7px_1.5px_#0000000A)_drop-shadow(0px_0.8px_0.5px_#0000000C)_drop-shadow(0px_0.8px_0.5px_#00000020)] sm:text-[clamp(2rem,9cqw,9.5rem)] sm:leading-none lg:[filter:drop-shadow(0px_3px_1.5px_#0000000D)_drop-shadow(0px_1px_0.5px_#0000000F)_drop-shadow(0px_1px_0.5px_#00000026)]"
        style={{
          fontFamily: "var(--font-sans)",
          letterSpacing: "-0.04em",
        }}
      >
        <span
          aria-hidden="true"
          className="col-start-1 row-start-1"
          style={{ color: "#fcfcfc", WebkitTextStroke: "1.2px #D1D1D1B3" }}
        >
          <WordmarkText />
        </span>
        <span
          className="col-start-1 row-start-1"
          style={{
            backgroundImage: "linear-gradient(180deg, #fafafa 0%, #ffffff 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
            WebkitTextFillColor: "transparent",
          }}
        >
          <WordmarkText />
        </span>
      </h1>
    </AnimatedSelectionHighlight>
  );
}
