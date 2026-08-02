"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import type { PostListItem } from "./queries";

/**
 * Motion vocabulary — pulled from the repo's animation skill so every surface
 * shares one feel. Springs for anything spatial, quick eases for opacity.
 */
const OPEN_MORPH = { type: "spring", duration: 0.5, bounce: 0.12 } as const;
const SLIDE = { type: "spring", duration: 0.5, bounce: 0.16 } as const;
const FADE = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;
const DRAWER = { duration: 0.4, ease: [0.32, 0.72, 0, 1] } as const;

// Carousel tuning (all relative to the frame width, no hard-coded px).
const PEEK_OFFSET = 1.06; // centre-to-centre distance of an adjacent slide, × frameW
const PEEK_SCALE = 0.76; // neighbours shrink so the centre slide is the focus

type MediaItem = PostListItem["images"][number];

export function PostOverlay({
  posts,
  index,
  onIndexChange,
  onClose,
}: {
  posts: PostListItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const post = posts[index];

  const [phase, setPhase] = useState<"in" | "browse">("in");
  const [closing, setClosing] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  // True briefly right after a post switch — peeks stay hidden so the switch is a
  // clean centre cross-fade instead of the neighbour stack shuffling into place.
  const [switching, setSwitching] = useState(false);
  const [stage, setStage] = useState(() => ({
    w: typeof window !== "undefined" ? Math.max(320, window.innerWidth - 340) : 1200,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  const stageRef = useRef<HTMLDivElement>(null);

  const openedOnce = useRef(false);
  useEffect(() => {
    openedOnce.current = true;
  }, []);

  // Reset to the first media the instant the active post changes — during render
  // (guarded) so there's no stale-index flash.
  const prevIndex = useRef(index);
  if (prevIndex.current !== index) {
    prevIndex.current = index;
    setMediaIndex(0);
    setSwitching(true);
  }

  const media: MediaItem[] = post?.images?.length
    ? post.images
    : post?.thumbnail
      ? [{ url: post.thumbnail.url, posterUrl: null, kind: "image", width: post.thumbnail.width, height: post.thumbnail.height }]
      : [];
  const mediaCount = media.length;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (phase !== "in") return;
    const t = setTimeout(() => setPhase("browse"), 560);
    return () => clearTimeout(t);
  }, [phase]);

  // After a post switch settles, let the neighbour peeks fade back in.
  useEffect(() => {
    if (!switching) return;
    const t = setTimeout(() => setSwitching(false), 280);
    return () => clearTimeout(t);
  }, [switching]);

  const requestClose = useCallback(() => setClosing(true), []);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 120);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  const goMedia = useCallback(
    (d: number) => {
      const nextI = mediaIndex + d;
      if (nextI < 0 || nextI >= mediaCount) return;
      setMediaIndex(nextI);
    },
    [mediaIndex, mediaCount],
  );

  const goPost = useCallback(
    (d: number) => {
      const nextI = index + d;
      if (nextI < 0 || nextI >= posts.length) return;
      onIndexChange(nextI);
    },
    [index, posts.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestClose();
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault(); // don't let arrows scroll the page / panel
      }
      if (e.key === "ArrowLeft") mediaIndex > 0 ? goMedia(-1) : goPost(-1);
      else if (e.key === "ArrowRight")
        mediaIndex < mediaCount - 1 ? goMedia(1) : goPost(1);
      else if (e.key === "ArrowUp") goPost(-1);
      else if (e.key === "ArrowDown") goPost(1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [goMedia, goPost, requestClose, mediaIndex, mediaCount]);

  if (!post) return null;

  // Frame sized to the post's aspect (from its first media) and fitted to the
  // stage; every slide shares this frame so the carousel reads uniformly.
  const aspect =
    media[0]?.width && media[0]?.height ? media[0].width / media[0].height : 4 / 3;
  let frameW = stage.w * 0.58;
  let frameH = frameW / aspect;
  const maxH = stage.h * 0.84;
  if (frameH > maxH) {
    frameH = maxH;
    frameW = frameH * aspect;
  }

  const overlay = (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/30 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={FADE}
        onClick={requestClose}
      />

      {/* Ambient light streaks (decorative) */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-soft-light"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="absolute -left-40 -top-40 h-[900px] w-[520px] rotate-[-60deg] rounded-full bg-white/40 blur-[120px]" />
        <div className="absolute left-1/3 -top-60 h-[1000px] w-[620px] rotate-[-55deg] rounded-full bg-white/30 blur-[140px]" />
        <div className="absolute right-10 -top-40 h-[900px] w-[520px] rotate-[-115deg] rounded-full bg-white/30 blur-[120px]" />
      </motion.div>

      {/* Top-left controls: close + prev/next post */}
      <motion.div
        className="absolute left-5 top-5 z-40 flex items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={FADE}
      >
        <ControlButton onClick={requestClose} label="Close">
          <X className="size-4" />
        </ControlButton>
        <ControlButton onClick={() => goPost(-1)} label="Previous post" disabled={index === 0}>
          <ChevronLeft className="size-4" />
        </ControlButton>
        <ControlButton
          onClick={() => goPost(1)}
          label="Next post"
          disabled={index === posts.length - 1}
        >
          <ChevronRight className="size-4" />
        </ControlButton>
      </motion.div>

      {/* Carousel stage — an absolute stack; neighbours translate out and scale
          down, overflowing the edges as peeks. Clipped to the area left of the panel. */}
      <div
        ref={stageRef}
        className="pointer-events-none absolute inset-y-0 left-0 right-0 overflow-hidden md:right-[340px]"
      >
        <AnimatePresence mode="sync">
          <motion.div
            key={post.id}
            className="absolute inset-0"
            // First open stays opaque so the shared-element morph reads cleanly;
            // later post switches cross-fade in.
            initial={{ opacity: openedOnce.current ? 0 : 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          >
            {media.map((m, i) => {
              const offset = i - mediaIndex;
              if (Math.abs(offset) > 2) return null;
              const isActive = offset === 0;
              const morph = (phase === "in" || closing) && isActive;
              const hidden = (phase === "in" || closing || switching) && !isActive;
              const step = Math.abs(offset);
              const x = isActive
                ? 0
                : Math.sign(offset) * frameW * PEEK_OFFSET * (step === 1 ? 1 : 1.92);
              const scale = isActive ? 1 : PEEK_SCALE;
              const zIndex = isActive ? 30 : step === 1 ? 20 : 10;
              return (
                <motion.div
                  key={`${post.id}-${i}`}
                  className={
                    isActive
                      ? "pointer-events-auto absolute left-1/2 top-1/2"
                      : "pointer-events-auto absolute left-1/2 top-1/2 cursor-pointer"
                  }
                  style={{ width: frameW, height: frameH, zIndex }}
                  onClick={() => (isActive ? undefined : setMediaIndex(i))}
                  // Mount directly at the resting position — no entrance animation,
                  // so switching posts never slides the media in "from the bottom".
                  // In-post media navigation still slides (animate change on a
                  // persistent element, not a mount).
                  initial={false}
                  animate={{
                    x: -frameW / 2 + x,
                    y: -frameH / 2,
                    scale,
                    opacity: hidden ? 0 : 1,
                  }}
                  transition={{ x: SLIDE, y: SLIDE, scale: SLIDE, opacity: FADE }}
                >
                  <motion.div
                    layoutId={morph ? `post-${post.id}` : undefined}
                    className="size-full overflow-hidden rounded-[12px] shadow-[0px_6px_38px_0px_rgba(0,0,0,0.18),0px_6px_24px_0px_rgba(0,0,0,0.12),0px_1px_1px_0px_rgba(0,0,0,0.2)]"
                    transition={morph ? OPEN_MORPH : undefined}
                    onLayoutAnimationComplete={
                      morph && phase === "in" ? () => setPhase("browse") : undefined
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      alt={isActive ? (post.caption ?? "") : ""}
                      draggable={false}
                      className="size-full select-none object-cover"
                    />
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Info panel */}
      <motion.aside
        className="absolute inset-y-0 right-0 z-30 flex w-[340px] max-w-[85vw] flex-col gap-4 overflow-y-auto border-l border-[#e3e5e8] bg-[#f7f7f7] p-4"
        initial={{ x: 360, opacity: 0 }}
        animate={{ x: closing ? 360 : 0, opacity: closing ? 0 : 1 }}
        transition={DRAWER}
      >
        <motion.div
          key={post.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={FADE}
          className="flex flex-col gap-3.5"
        >
          <Link href={`/creator/${post.creator.username}`} className="flex items-center gap-3">
            {post.creator.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.creator.avatarUrl}
                alt={post.creator.displayName}
                className="size-[42px] shrink-0 rounded-full object-cover"
                draggable={false}
              />
            ) : (
              <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[#e3e5e8] text-sm font-medium text-[#707275]">
                {post.creator.displayName?.[0] ?? "?"}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-base font-semibold tracking-tight text-[#1f2123]">
                {post.creator.displayName}
              </span>
              <span className="truncate text-base tracking-tight text-[#707275]">
                @{post.creator.username}
              </span>
            </div>
          </Link>

          {post.caption ? (
            <p className="whitespace-pre-wrap text-base leading-5 tracking-tight text-[#222426]">
              {post.caption}
            </p>
          ) : null}
        </motion.div>

        <div className="flex flex-col">
          <Row label="Source">
            <Link
              href={post.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-black hover:underline"
            >
              X <ExternalLink className="size-3.5" />
            </Link>
          </Row>
          {post.categories.length > 0 ? (
            <Row label="Category">
              <span className="text-black">{post.categories[0].name}</span>
            </Row>
          ) : null}
          {post.categories.length > 1 ? (
            <Row label="Tags">
              <span className="text-right text-black">
                {post.categories.slice(1).map((c) => c.name).join(", ")}
              </span>
            </Row>
          ) : null}
        </div>
      </motion.aside>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}

function ControlButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md transition-colors hover:bg-white/20 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[#e3e5e8] py-3 text-sm shadow-[0px_1px_0px_0px_white]">
      <span className="text-[#717376]">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}
