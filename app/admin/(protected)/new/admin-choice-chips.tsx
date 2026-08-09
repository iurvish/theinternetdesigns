"use client";

import { cn } from "@/lib/utils";

/** Larger, clearer selection chips for admin forms (categories / interaction). */
export function ChoiceChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-sm font-medium tracking-tight transition-[background-color,border-color,color,transform] active:scale-[0.98] motion-reduce:active:scale-100",
        active
          ? "border-[#1f2123] bg-[#1f2123] text-white"
          : "border-border/80 bg-background text-foreground hover:border-foreground/25 hover:bg-muted/60",
      )}
    >
      {label}
    </button>
  );
}

export function ChoiceChipGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}
