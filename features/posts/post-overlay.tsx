"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import type { PostListItem } from "./queries";

/**
 * Motion vocabulary — pulled from the repo's animation skill so every surface
 * shares one feel. Springs for anything spatial, quick eases for opacity.
 */
const MORPH = { type: "spring", duration: 0.5, bounce: 0.16 } as const;
const SLIDE = { type: "spring", duration: 0.55, bounce: 0.18 } as const;
const FADE = { duration: 0.22, ease: [0.23, 1, 0.32, 1] } as const;
const DRAWER = { duration: 0.42, ease: [0.32, 0.72, 0, 1] } as const;

type Slot = { x: number; scale: number; opacity: number; zIndex: number };

function slotFor(offset: number, peekX: number): Slot {
  const abs = Math.abs(offset);
  if (abs === 0) return { x: 0, scale: 1, opacity: 1, zIndex: 30 };
  if (abs === 1)
    return { x: Math.sign(offset) * peekX, scale: 0.82, opacity: 0.5, zIndex: 20 };
  return { x: Math.sign(offset) * peekX * 1.7, scale: 0.7, opacity: 0, zIndex: 10 };
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

  // 'in' = the opening morph is playing (only the active card is shown, and it
  // carries the shared layoutId). 'browse' = the full carousel with peeking
  // neighbours; the active card drops its layoutId so post-to-post navigation is
  // a clean transform slide instead of a fling from the grid.
  const [phase, setPhase] = useState<"in" | "browse">("in");
  const [closing, setClosing] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [imgDir, setImgDir] = useState(1);
  const [peekX, setPeekX] = useState(460);
  const areaRef = useRef<HTMLDivElement>(null);

  // Measure the stage so peeking neighbours sit near the viewport edges.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setPeekX(Math.max(320, el.clientWidth * 0.46));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fallback in case onLayoutAnimationComplete doesn't fire (reduced motion, etc).
  useEffect(() => {
    if (phase !== "in") return;
    const t = setTimeout(() => setPhase("browse"), 600);
    return () => clearTimeout(t);
  }, [phase]);

  const requestClose = useCallback(() => setClosing(true), []);

  // Once the exit fade has played, unmount — the grid card re-takes the shared
  // layoutId and morphs back into place.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 200);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  const images = post?.images?.length ? post.images : post?.thumbnail ? [
    { url: post.thumbnail.url, posterUrl: null, kind: "image" as const, width: post.thumbnail.width, height: post.thumbnail.height },
  ] : [];
  const hasMany = images.length > 1;

  const goImage = useCallback(
    (dir: number) => {
      if (!hasMany) return;
      setImgDir(dir);
      setImageIndex((i) => (i + dir + images.length) % images.length);
    },
    [hasMany, images.length],
  );

  const goPost = useCallback(
    (dir: number) => {
      const next = index + dir;
      if (next < 0 || next >= posts.length) return;
      onIndexChange(next);
    },
    [index, posts.length, onIndexChange],
  );

  // Reset the inner image carousel whenever the active post changes.
  useEffect(() => {
    setImageIndex(0);
  }, [index]);

  // Keyboard: ←/→ posts, ↑/↓ images, Esc closes. Lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
      else if (e.key === "ArrowLeft") goPost(-1);
      else if (e.key === "ArrowRight") goPost(1);
      else if (e.key === "ArrowUp") goImage(-1);
      else if (e.key === "ArrowDown") goImage(1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [goPost, goImage, requestClose]);

  if (!post) return null;

  // The window of posts that share the stage. During the opening morph only the
  // active card is present; afterwards the neighbours fade in.
  const windowPosts =
    phase === "in"
      ? [{ post, offset: 0, i: index }]
      : Array.from({ length: 5 }, (_, k) => index - 2 + k)
          .filter((i) => i >= 0 && i < posts.length)
          .map((i) => ({ post: posts[i], offset: i - index, i }));

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

      {/* Ambient light streaks (decorative, mix-blend) */}
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

      {/* Close button */}
      <motion.button
        type="button"
        onClick={requestClose}
        aria-label="Close"
        className="absolute left-5 top-5 z-40 flex size-9 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md transition-colors hover:bg-white/20"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={FADE}
      >
        <X className="size-4" />
      </motion.button>

      {/* Carousel stage */}
      <div
        ref={areaRef}
        className="pointer-events-none absolute inset-y-0 left-0 right-0 overflow-hidden"
      >
        {windowPosts.map(({ post: p, offset, i }) => {
          const isActive = offset === 0;
          const morph = (phase === "in" || closing) && isActive;
          const slot = slotFor(offset, peekX);
          const cur = isActive ? images[imageIndex] : p.images[0] ?? p.thumbnail;
          const src = cur?.url ?? p.thumbnail?.url ?? "";
          return (
            <div
              key={p.id}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{ zIndex: slot.zIndex }}
            >
              <motion.div
                layoutId={morph ? `post-${p.id}` : undefined}
                className="pointer-events-auto relative cursor-pointer"
                onClick={() => (isActive ? undefined : onIndexChange(i))}
                initial={
                  phase === "in" && isActive
                    ? false
                    : { opacity: 0, scale: slot.scale, x: slot.x }
                }
                animate={
                  morph
                    ? { opacity: 1 }
                    : { x: slot.x, scale: slot.scale, opacity: closing && isActive ? 1 : slot.opacity }
                }
                transition={morph ? MORPH : SLIDE}
                onLayoutAnimationComplete={
                  phase === "in" && isActive ? () => setPhase("browse") : undefined
                }
              >
                {/* Main media */}
                <AnimatePresence initial={false} custom={imgDir} mode="popLayout">
                  <motion.img
                    key={isActive ? `${p.id}-${imageIndex}` : p.id}
                    src={src}
                    alt={p.caption ?? ""}
                    draggable={false}
                    custom={imgDir}
                    initial={isActive && phase !== "in" ? { opacity: 0, x: imgDir * 48 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: imgDir * -48 }}
                    transition={SLIDE}
                    className="block max-h-[74vh] max-w-[54vw] rounded-[12px] object-contain shadow-[0px_6px_38px_0px_rgba(0,0,0,0.18),0px_6px_24px_0px_rgba(0,0,0,0.12),0px_1px_1px_0px_rgba(0,0,0,0.2)]"
                  />
                </AnimatePresence>

                {/* Inner image carousel: the "next image" peeks at the right */}
                {isActive && hasMany && phase === "browse" && !closing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => goImage(1)}
                      aria-label="Next image"
                      className="absolute top-1/2 left-full ml-3 hidden -translate-y-1/2 overflow-hidden rounded-[12px] border border-white/20 shadow-[0px_6px_24px_0px_rgba(0,0,0,0.18)] transition-transform hover:scale-[1.03] md:block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={images[(imageIndex + 1) % images.length]?.url}
                        alt=""
                        className="h-40 w-28 object-cover opacity-90"
                        draggable={false}
                      />
                    </button>
                    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1.5 backdrop-blur-md">
                      {images.map((_, di) => (
                        <button
                          key={di}
                          type="button"
                          aria-label={`Image ${di + 1}`}
                          onClick={() => {
                            setImgDir(di > imageIndex ? 1 : -1);
                            setImageIndex(di);
                          }}
                          className={`size-1.5 rounded-full transition-colors ${
                            di === imageIndex ? "bg-white" : "bg-white/40"
                          }`}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
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
