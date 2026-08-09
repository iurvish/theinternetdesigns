"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Figma 58:2608 — 18px swatches; hover shows copy, click copies + check. */
export function ColorSwatches({ colors }: { colors: string[] }) {
  if (colors.length === 0) {
    return <span className="text-sm text-[#717376]">—</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {colors.slice(0, 6).map((hex) => (
        <CopyableSwatch key={hex} hex={hex} />
      ))}
    </div>
  );
}

function CopyableSwatch({ hex }: { hex: string }) {
  const [state, setState] = useState<"idle" | "copied">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(hex);
      setState("copied");
      window.setTimeout(() => setState("idle"), 1200);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${hex}`}
      title={hex}
      className={cn(
        "group relative size-[18px] shrink-0 overflow-hidden rounded-[6px] transition-transform active:scale-95",
        "shadow-[0_0.3px_2px_0_rgba(6,2,0,0.6),0_0_0_1px_currentColor]",
      )}
      style={{ backgroundColor: hex, color: hex }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0.5px_0.5px_0.1px_rgba(251,251,251,0.15)]"
      />
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition-opacity",
          "group-hover:opacity-100",
          state === "copied" && "opacity-100",
        )}
      >
        {state === "copied" ? (
          <Check className="size-2.5" strokeWidth={2.5} />
        ) : (
          <Copy className="size-2.5" strokeWidth={2.2} />
        )}
      </span>
    </button>
  );
}
