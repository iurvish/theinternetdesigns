"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostListItem } from "./queries";
import { faviconFor, siteHost } from "./website-card";

/**
 * How long to wait for the frame before assuming the site refused to be
 * embedded. A blocked frame fires no `load` in most browsers and there is no
 * event for `X-Frame-Options` / `frame-ancestors`, so a timer is the only
 * signal available from script.
 */
const FRAME_TIMEOUT_MS = 4000;

const PANEL_IN = { type: "spring", duration: 0.4, bounce: 0.1 } as const;
const FADE = { duration: 0.18, ease: [0.23, 1, 0.32, 1] } as const;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/35";

const noopSubscribe = () => () => {};

/** True once hydrated — `document` only exists then, and this avoids the
 *  set-state-in-effect the lint rule (rightly) rejects. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function WebsitePreview({
  post,
  siteUrl,
  open,
  onClose,
}: {
  post: PostListItem | null;
  siteUrl: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const mounted = useHydrated();

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && post && siteUrl ? (
        <PreviewBody post={post} siteUrl={siteUrl} onClose={onClose} />
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function PreviewBody({
  post,
  siteUrl,
  onClose,
}: {
  post: PostListItem;
  siteUrl: string;
  onClose: () => void;
}) {
  const host = siteHost(siteUrl);
  const name = post.title?.trim() || host;
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and the page behind must not scroll while this is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey, true);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (loaded) return;
    const id = window.setTimeout(() => setBlocked(true), FRAME_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [loaded]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6"
      data-website-preview
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onClose}
        className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} preview`}
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 6 }}
        transition={PANEL_IN}
        className={cn(
          "relative flex h-full max-h-[52rem] w-full max-w-[78rem] flex-col overflow-hidden",
          "rounded-2xl border border-line-strong bg-panel",
          "shadow-[0_0_0_1px_rgba(16,24,40,0.04),0_24px_48px_-12px_rgba(16,24,40,0.24)]",
        )}
      >
        {/* Browser-chrome header: who you're looking at, and the way out. */}
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-3 sm:px-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- third-party
              favicon host; not worth a remotePatterns entry for a 20px icon. */}
          <img
            src={faviconFor(siteUrl)}
            alt=""
            width={20}
            height={20}
            className="size-5 shrink-0 rounded-[0.25rem]"
          />
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate text-sm font-medium tracking-tight text-ink">
              {name}
            </span>
            <span className="hidden truncate text-[0.75rem] tracking-tight text-ink-2 sm:block">
              {host}
            </span>
          </div>

          <a
            href={siteUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-[0.8125rem] font-medium tracking-tight text-white",
              "transition-[background-color,transform] duration-150 ease-out",
              "hover:bg-[oklch(0.31_0.005_258)] active:scale-[0.96] motion-reduce:active:scale-100",
              FOCUS,
            )}
          >
            Open Site
            <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
          </a>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-[0.625rem] text-ink-2",
              "transition-[background-color,color,transform] duration-150 ease-out",
              "hover:bg-chip hover:text-ink active:scale-[0.96] motion-reduce:active:scale-100",
              FOCUS,
            )}
          >
            <X className="size-[1.125rem]" strokeWidth={1.8} />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 bg-canvas">
          {/* A skeleton, not `post.thumbnail`: that screenshot is of the
              design the post came from, not of this site, so using it here
              showed the viewer an unrelated page while the frame loaded. */}
          {!loaded ? (
            <div
              className="absolute inset-0 animate-pulse bg-skel motion-reduce:animate-none"
              aria-hidden
            />
          ) : null}

          <iframe
            src={siteUrl}
            title={`${name} preview`}
            onLoad={() => {
              setLoaded(true);
              setBlocked(false);
            }}
            // Cross-origin, so `allow-same-origin` gives the frame its own
            // origin rather than ours — it still cannot reach this document.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            className={cn(
              "absolute inset-0 size-full border-0 bg-panel transition-opacity duration-300 ease-out",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />

          {blocked && !loaded ? <FrameBlocked siteUrl={siteUrl} /> : null}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Plenty of sites send `X-Frame-Options: DENY` or a `frame-ancestors` CSP, and
 * nothing we do here changes that. Say so plainly and hand over the one action
 * that does work instead of leaving a white rectangle.
 */
function FrameBlocked({ siteUrl }: { siteUrl: string }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
      <div
        role="status"
        className={cn(
          "flex max-w-xl items-center gap-3 rounded-xl border border-line-strong bg-panel px-3.5 py-3",
          "shadow-[0_8px_24px_-8px_rgba(16,24,40,0.18)]",
        )}
      >
        <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug tracking-tight text-ink-2">
          <span className="font-medium text-ink">
            {siteHost(siteUrl)} won&rsquo;t load in a frame.
          </span>{" "}
          It blocks embedding, so there is nothing to show here.
        </p>
        <a
          href={siteUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 text-[0.75rem] font-medium tracking-tight text-white",
            "transition-[background-color,transform] duration-150 ease-out",
            "hover:bg-[oklch(0.31_0.005_258)] active:scale-[0.96] motion-reduce:active:scale-100",
            FOCUS,
          )}
        >
          Open Site
          <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden />
        </a>
      </div>
    </div>
  );
}
