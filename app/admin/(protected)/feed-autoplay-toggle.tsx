"use client";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { updateFeedAutoplay } from "./settings-actions";

export function FeedAutoplayToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next); // optimistic
    startTransition(async () => {
      try {
        await updateFeedAutoplay(next);
      } catch {
        setOn(!next); // revert on failure
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span className="text-sm font-medium">Autoplay videos in feed</span>
        <span className="text-xs text-muted-foreground">
          {on
            ? "Videos play automatically in the grid."
            : "Videos play on hover; the lightbox always autoplays."}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Autoplay videos in feed"
        disabled={pending}
        onClick={toggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
          on ? "bg-foreground" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-background shadow transition-transform",
            on ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
