import { cn } from "@/lib/utils";

/**
 * Decorative "paper curl" dog-ear for the top-right corner of the paper sheet
 * (Figma node 31:11). Purely ornamental — aria-hidden and non-interactive.
 * Scales down on small screens so it never dominates the corner. The source SVG
 * carries its own gradients + blurred shadow, so we just stretch it to fill.
 */
export function PaperCurl({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      // The artwork's folded flap sits in its top-right; pin it to the sheet's
      // top-right corner. Stretched to the Figma frame's 180×150 so the curve
      // matches exactly; the soft shadow falls down-left into the sheet.
      className={cn(
        "pointer-events-none absolute right-0 top-0 z-20 block aspect-[180/150] w-[84px] bg-[length:100%_100%] bg-no-repeat sm:w-[130px] lg:w-[168px]",
        className,
      )}
      style={{ backgroundImage: "url(/paper-curl.svg)" }}
    />
  );
}
