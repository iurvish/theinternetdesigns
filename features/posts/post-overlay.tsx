"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import type { PostListItem } from "./queries";

/**
 * Motion vocabulary — pulled from the repo's animation skill so every surface
 * shares one feel. Springs for anything spatial, quick eases for opacity.
 */
const OPEN_MORPH = { type: "spring", duration: 0.44, bounce: 0.14 } as const;
const SLIDE = { type: "spring", duration: 0.5, bounce: 0.16 } as const;
const FADE = { duration: 0.18, ease: [0.23, 1, 0.32, 1] } as const;
const DRAWER = { duration: 0.4, ease: [0.32, 0.72, 0, 1] } as const;

type MediaItem = PostListItem["images"][number];

function mediaSlot(offset: number, peekX: number) {
  if (offset === 0) return { x: 0, scale: 1, zIndex: 30 };
  // Side previews of the SAME post's other media — full opacity, tucked partly
  // behind the centred main image.
  return { x: Math.sign(offset) * peekX, scale: 0.62, zIndex: 20 };
}

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

  // 'in' = the opening morph is playing (only the active media is shown, and it
  // carries the shared layoutId). 'browse' = the media carousel with its side
  // previews; the main image drops its layoutId so navigation is a clean slide.
  const [phase, setPhase] = useState<"in" | "browse">("in");
  const [closing, setClosing] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [peekX, setPeekX] = useState(420);
  const areaRef = useRef<HTMLDivElement>(null);

  const media: MediaItem[] = post?.images?.length
    ? post.images
    : post?.thumbnail
      ? [{ url: post.thumbnail.url, posterUrl: null, kind: "image", width: post.thumbnail.width, height: post.thumbnail.height }]
      : [];
  const hasMany = media.length > 1;

  // Measure the stage (viewport minus the info panel) so the side previews sit
  // just past the edges of the centred image.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setPeekX(Math.max(300, el.clientWidth * 0.4));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fallback in case onLayoutAnimationComplete doesn't fire (reduced motion, etc).
  useEffect(() => {
    if (phase !== "in") return;
    const t = setTimeout(() => setPhase("browse"), 520);
    return () => clearTimeout(t);
  }, [phase]);

  const requestClose = useCallback(() => setClosing(true), []);

  // Faster exit: brief fade, then unmount so the grid card re-takes the shared
  // layoutId and morphs back.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 120);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  const goMedia = useCallback(
    (d: number) => {
      setMediaIndex((i) => {
        const next = i + d;
        if (next < 0 || next >= media.length) return i;
        setDir(d);
        return next;
      });
    },
    [media.length],
  );

  const goPost = useCallback(
    (d: number) => {
      const next = index + d;
      if (next < 0 || next >= posts.length) return;
      onIndexChange(next);
    },
    [index, posts.length, onIndexChange],
  );

  // Reset the media carousel whenever the active post changes.
  useEffect(() => {
    setMediaIndex(0);
  }, [index]);

  // Keyboard: ←/→ media (posts if single-media), ↑/↓ posts, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
      else if (e.key === "ArrowLeft") hasMany ? goMedia(-1) : goPost(-1);
      else if (e.key === "ArrowRight") hasMany ? goMedia(1) : goPost(1);
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
  }, [goMedia, goPost, requestClose, hasMany]);

  if (!post) return null;

  // The window of media that shares the stage. During the opening morph only the
  // active image is present; afterwards its neighbours slide in.
  const windowMedia =
    phase === "in"
      ? [{ item: media[mediaIndex], offset: 0, i: mediaIndex }]
      : media
          .map((item, i) => ({ item, offset: i - mediaIndex, i }))
          .filter(({ offset }) => Math.abs(offset) <= 1);

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
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md transition-colors hover:bg-white/20"
        >
          <X className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => goPost(-1)}
          disabled={index === 0}
          aria-label="Previous post"
          className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md transition-colors hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => goPost(1)}
          disabled={index === posts.length - 1}
          aria-label="Next post"
          className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md transition-colors hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
      </motion.div>

      {/* Carousel stage — centred in the space left of the info panel */}
      <div
        ref={areaRef}
        className="pointer-events-none absolute inset-y-0 left-0 right-0 overflow-hidden md:right-[340px]"
      >
        {windowMedia.map(({ item, offset, i }) => {
          const isActive = offset === 0;
          const morph = (phase === "in" || closing) && isActive;
          const slot = mediaSlot(offset, peekX);
          return (
            <div
              key={`${post.id}-${i}`}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{ zIndex: slot.zIndex }}
            >
              <motion.div
                layoutId={morph ? `post-${post.id}` : undefined}
                className="pointer-events-auto cursor-pointer"
                onClick={() => (isActive ? undefined : setMediaIndex(i))}
                initial={
                  phase === "in" && isActive
                    ? false
                    : { opacity: 0, scale: slot.scale, x: slot.x }
                }
                animate={
                  morph
                    ? { opacity: 1 }
                    : { x: slot.x, scale: slot.scale, opacity: 1 }
                }
                transition={morph ? OPEN_MORPH : SLIDE}
                onLayoutAnimationComplete={
                  phase === "in" && isActive ? () => setPhase("browse") : undefined
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item?.url}
                  alt={isActive ? (post.caption ?? "") : ""}
                  draggable={false}
                  className="block max-h-[80vh] max-w-[52vw] rounded-[12px] object-contain shadow-[0px_6px_38px_0px_rgba(0,0,0,0.18),0px_6px_24px_0px_rgba(0,0,0,0.12),0px_1px_1px_0px_rgba(0,0,0,0.2)]"
                />
              </motion.div>
            </div>
          );
        })}
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
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={FADE}
          className="flex flex-col gap-3.5"
        >
          <Link
            href={`/creator/${post.creator.username}`}
            className="flex items-center gap-3"
          >
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[#e3e5e8] py-3 text-sm shadow-[0px_1px_0px_0px_white]">
      <span className="text-[#717376]">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}
