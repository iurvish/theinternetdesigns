"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostListItem } from "./queries";

/**
 * The frame renders at a desktop width and is scaled down to the tile, so the
 * preview shows the site's desktop layout rather than its mobile breakpoint
 * cramped into a card. `FRAME_H` is the slice of page the tile shows, and the
 * tile's `aspect-ratio` is derived from it, so the two always match.
 */
const FRAME_W = 1280;
const FRAME_H = 1500;
const TILE_ASPECT = `${FRAME_W} / ${FRAME_H}`;

/**
 * How much page the frame actually renders. Taller than the tile on purpose:
 * that surplus is what the wheel scrolls through.
 *
 * Scrolling a cross-origin frame from the parent is impossible — the document
 * isn't reachable — and making the frame itself interactive hands it the
 * clicks too, which is the thing we don't want. So the frame renders a long
 * strip, stays `pointer-events-none`, and the tile moves it under the window
 * it is clipped by. The reader scrolls the site; every click is still ours.
 */
const FRAME_RENDER_H = 4200;
const MAX_OFFSET = FRAME_RENDER_H - FRAME_H;

/**
 * The page owns the wheel by default. A tile only takes it once the pointer
 * has been still inside it for this long, and any page scroll disarms every
 * tile again — so scrolling down the feed never gets caught by a card you
 * happen to pass over, and pausing on one then scrolling moves the preview.
 */
const ARM_DELAY_MS = 350;
/** A page scroll this recent means the gesture belongs to the page. */
const PAGE_SCROLL_GRACE_MS = 300;

/**
 * The masonry packer needs the same number, or it balances columns against a
 * height these cards never have. Exported so the two cannot drift.
 */
export const WEBSITE_TILE_RATIO = FRAME_W / FRAME_H;

/**
 * Start loading well before the card scrolls in — a site is a whole page load,
 * so waiting until it is on screen means watching it paint. Unmount a while
 * after it leaves: each of these is a live site, and keeping every card that
 * has ever been seen mounted would leave dozens running. The delay is what
 * stops a scroll up-and-back from reloading everything.
 */
const MOUNT_MARGIN = "1200px";
const UNMOUNT_DELAY_MS = 20_000;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/35";

/**
 * Host without `www.`, for display. Falls back to the raw string so a
 * malformed URL still renders something rather than blanking the card.
 */
export function siteHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

/** Google's favicon service — no key, and it falls back to a globe itself. */
export function faviconFor(url: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    siteHost(url),
  )}&sz=${size}`;
}

/**
 * A site, not a screenshot: the tile is the live page and the wheel scrolls
 * through it, but every click belongs to the card — it opens the site
 * full-size in a dialog. See `LiveTile` for why that split is possible, and
 * `WebsitePreview` for the dialog.
 */
export function WebsiteCard({
  post,
  siteUrl,
  onOpen,
}: {
  post: PostListItem;
  siteUrl: string;
  onOpen: () => void;
}) {
  const host = siteHost(siteUrl);
  const name = post.title?.trim() || host;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Preview ${name}`}
      className={cn(
        "group block w-full rounded-xl border border-line-strong bg-panel p-1.5 text-left",
        // Border and lift only — no shadow. Nothing here changes the card's
        // size, so the grid around it cannot reflow on hover.
        "transition-[border-color,transform] duration-200 ease-out",
        "hover:-translate-y-px hover:border-ink-4/40",
        "active:translate-y-0 active:scale-[0.995]",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        FOCUS,
      )}
    >
      <LiveTile siteUrl={siteUrl} name={name} />

      <div className="flex items-center gap-2 px-1.5 pb-0.5 pt-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- third-party
            favicon host, not worth a remotePatterns entry for a 16px icon. */}
        <img
          src={faviconFor(siteUrl)}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          className="size-4 shrink-0 rounded-[0.1875rem]"
        />
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium tracking-tight text-ink">
          {name}
        </span>
        <span className="min-w-0 shrink-0 truncate text-[0.75rem] tracking-tight text-ink-2">
          {host}
        </span>
        <ArrowUpRight
          className="size-3.5 shrink-0 text-ink-4 transition-colors duration-150 ease-out group-hover:text-ink-2"
          strokeWidth={2}
          aria-hidden
        />
      </div>
    </button>
  );
}

/**
 * The live page, scaled into the tile, scrollable but not clickable.
 *
 * The frame is `pointer-events-none`, so clicks and taps fall through to the
 * card button behind it. Scrolling is ours: a non-passive `wheel` listener
 * moves the frame's `top` within the clipped tile.
 *
 * Two rules keep that from stealing the page's scroll, which is the usual way
 * embedded previews go wrong:
 *
 *  1. A tile is disarmed until the pointer has rested in it for
 *     `ARM_DELAY_MS`, and any page scroll disarms it again. Scrolling down the
 *     feed therefore passes straight over cards; pausing on one and then
 *     scrolling moves the preview.
 *  2. At either end of the strip the handler stops calling `preventDefault`,
 *     so the wheel returns to the page rather than dead-ending in the card.
 *
 * Deliberately *not* backed by `post.thumbnail`: that screenshot belongs to
 * the design the post was captured from and has nothing to do with the site
 * this card points at, so using it as the placeholder made every card flash an
 * unrelated design before the frame arrived. A plain skeleton is honest.
 */
function LiveTile({ siteUrl, name }: { siteUrl: string; name: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [offset, setOffset] = useState(0);
  // Mirrored in a ref so the wheel listener reads the live value without the
  // effect having to re-bind every time it flips.
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);

  // Scale is measured, not computed in CSS: there is no way to divide a length
  // by a length to get the unitless factor `transform: scale()` needs.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      if (w > 0) setScale(w / FRAME_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let unmountTimer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          window.clearTimeout(unmountTimer);
          setMounted(true);
        } else {
          unmountTimer = window.setTimeout(() => {
            setMounted(false);
            setLoaded(false);
            setOffset(0);
          }, UNMOUNT_DELAY_MS);
        }
      },
      { rootMargin: MOUNT_MARGIN },
    );
    io.observe(el);
    return () => {
      window.clearTimeout(unmountTimer);
      io.disconnect();
    };
  }, []);

  // Bound to the element rather than via `onWheel`: React routes wheel through
  // a passive root listener, where `preventDefault()` is a no-op.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !loaded || scale <= 0) return;

    let armTimer = 0;
    let lastPageScroll = 0;
    // Seeded from `:hover`, not from `pointerenter`. This effect re-runs when
    // the frame finishes loading, and by then the pointer is usually already
    // inside the tile — waiting for an enter event that has already fired
    // meant the tile never armed at all.
    let inside = el.matches(":hover");

    const setArmedState = (next: boolean) => {
      if (armedRef.current === next) return;
      armedRef.current = next;
      setArmed(next);
    };
    const arm = () => {
      window.clearTimeout(armTimer);
      if (!inside) return;
      armTimer = window.setTimeout(() => setArmedState(inside), ARM_DELAY_MS);
    };
    const disarm = () => {
      window.clearTimeout(armTimer);
      setArmedState(false);
    };

    const onEnter = () => {
      inside = true;
      arm();
    };
    const onLeave = () => {
      inside = false;
      disarm();
    };
    // Movement restarts the clock: resting in the tile is the signal, not
    // merely being inside it while the page slides past underneath.
    const onMove = () => {
      inside = true;
      if (!armedRef.current) arm();
    };
    const onPageScroll = () => {
      lastPageScroll = Date.now();
      disarm();
      arm();
    };

    const onWheel = (e: WheelEvent) => {
      const dy = e.deltaY;
      if (dy === 0 || !armedRef.current) return;
      if (Date.now() - lastPageScroll < PAGE_SCROLL_GRACE_MS) return;
      setOffset((prev) => {
        // Divide by the scale so a wheel tick moves the preview the same
        // number of on-screen pixels it would move the page.
        const next = Math.min(MAX_OFFSET, Math.max(0, prev + dy / scale));
        // Only swallow the event while there is somewhere left to go, so the
        // feed takes over at the ends instead of the card trapping the wheel.
        if (next !== prev) e.preventDefault();
        return next;
      });
    };

    arm();

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onPageScroll, { passive: true });
    return () => {
      window.clearTimeout(armTimer);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onPageScroll);
    };
  }, [loaded, scale]);

  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden rounded-lg border border-line bg-skel"
      style={{ aspectRatio: TILE_ASPECT }}
    >
      {!loaded ? (
        <div
          className="absolute inset-0 animate-pulse bg-skel motion-reduce:animate-none"
          aria-hidden
        />
      ) : null}

      {/* Says when the wheel belongs to the preview. Without it the handover
          is invisible and the tile looks broken until it happens to work. */}
      {loaded ? (
        <span
          className={cn(
            "pointer-events-none absolute bottom-2 left-2 z-10 rounded-full bg-ink/80 px-2 py-1",
            "text-[0.6875rem] font-medium tracking-tight text-white backdrop-blur-sm",
            "transition-opacity duration-200 ease-out motion-reduce:transition-none",
            armed ? "opacity-0" : "opacity-0 group-hover:opacity-100",
          )}
        >
          Hold to scroll
        </span>
      ) : null}

      {mounted && scale > 0 ? (
        <iframe
          src={siteUrl}
          title={`${name} preview`}
          tabIndex={-1}
          aria-hidden
          // Nothing in here is interactive, so the frame gets the narrowest
          // sandbox that still renders the page.
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          style={{
            width: FRAME_W,
            height: FRAME_RENDER_H,
            top: -offset * scale,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          className={cn(
            "pointer-events-none absolute left-0 border-0 bg-panel",
            "transition-opacity duration-200 ease-out motion-reduce:transition-none",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
    </div>
  );
}
