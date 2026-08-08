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
const SLIDE = { type: "spring", duration: 0.42, bounce: 0.12 } as const;
const FADE = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;
const DRAWER = { duration: 0.4, ease: [0.32, 0.72, 0, 1] } as const;

// Carousel tuning (all relative to the frame width, no hard-coded px).
const PEEK_OFFSET = 1.06; // centre-to-centre distance of an adjacent slide, × frameW
const PEEK_SCALE = 0.76; // neighbours shrink so the centre slide is the focus

const FRAME_SHADOW =
  "0 4px 20px -2px rgba(0,0,0,0.10), 0 2px 6px -1px rgba(0,0,0,0.06)";

// Backdrop / ambient fade on close is stretched to ~match the reverse morph, so
// the grid card lands exactly as the scrim clears — one unified exit, never a
// "card still flying home" after the overlay has visually closed.
const CLOSE_FADE = { duration: 0.42, ease: [0.33, 0, 0.2, 1] } as const;

type MediaItem = PostListItem["images"][number];

export function PostOverlay({
  posts,
  index,
  initialMediaIndex = 0,
  onIndexChange,
  onMediaIndex,
  onClose,
  getVideoTime,
  setVideoTime,
}: {
  posts: PostListItem[];
  index: number;
  initialMediaIndex?: number;
  onIndexChange: (i: number) => void;
  onMediaIndex?: (postId: string, idx: number) => void;
  onClose: () => void;
  /** Shared per-post video position, so the lightbox resumes the grid card's clip. */
  getVideoTime?: (id: string) => number | undefined;
  setVideoTime?: (id: string, t: number) => void;
}) {
  const post = posts[index];

  const [phase, setPhase] = useState<"in" | "browse">("in");
  const [closing, setClosing] = useState(false);
  // Resume on whatever image the card was previewing, so the opening morph hands
  // off between the same picture.
  const [mediaIndex, setMediaIndex] = useState(initialMediaIndex);
  // True briefly right after a post switch — the filmstrip focus-pulls in (blur)
  // rather than sliding, since the two posts' images are unrelated.
  const [switching, setSwitching] = useState(false);
  // Reveal the neighbour peeks shortly after open, independently of the (slower)
  // entrance morph, so the other media show up quickly instead of waiting it out.
  const [peeksIn, setPeeksIn] = useState(false);
  // When media changes faster than the slide can settle — holding the arrow key or
  // spamming it — snap instantly instead of animating (a held key that animates
  // just looks laggy). Falls back to the smooth slide for deliberate single steps.
  const [fastNav, setFastNav] = useState(false);
  const lastNavRef = useRef(0);
  const navResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stage, setStage] = useState(() => ({
    w: typeof window !== "undefined" ? Math.max(320, window.innerWidth - 340) : 1200,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  const stageRef = useRef<HTMLDivElement>(null);

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

  // Peeks fade in ~0.25s after mount — the entrance morph is still finishing, but
  // the neighbours are already there, so opening a multi-image post feels instant.
  useEffect(() => {
    const t = setTimeout(() => setPeeksIn(true), 240);
    return () => clearTimeout(t);
  }, []);

  // After a post switch settles, let the neighbour peeks fade back in.
  useEffect(() => {
    if (!switching) return;
    const t = setTimeout(() => setSwitching(false), 280);
    return () => clearTimeout(t);
  }, [switching]);

  // Warm the browser cache with every image in the open post so the neighbouring
  // media appear instantly. Thumbnails go first (tiny, so the peeks are never blank
  // when they reveal), then the full-size renders for crisp paging.
  useEffect(() => {
    if (!post) return;
    const sources = [
      ...post.images.map((m) => m.posterUrl),
      ...post.images.map((m) => m.url),
    ].filter((u): u is string => Boolean(u));
    const preloaded = sources.map((u) => {
      const img = new window.Image();
      img.src = u;
      return img;
    });
    return () => {
      // Abort any still-in-flight preloads if the post changes quickly.
      preloaded.forEach((img) => (img.src = ""));
    };
  }, [post]);

  // On close (only), snap the grid card to whatever media the lightbox is on, so
  // the reverse morph hands off between the *same* picture — the card is otherwise
  // left untouched while browsing (so it never visibly changes behind the scrim).
  // The parent resets it back to the first image once the exit finishes.
  const requestClose = useCallback(() => {
    if (post) onMediaIndex?.(post.id, mediaIndex);
    setClosing(true);
  }, [post, mediaIndex, onMediaIndex]);

  useEffect(() => {
    if (!closing) return;
    // The morph layer unmounts the instant `closing` flips, kicking off the
    // reverse morph immediately; this only needs to outlast the (now morph-matched)
    // backdrop fade and panel slide so they finish before the portal is torn down.
    const t = setTimeout(onClose, 460);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  const goMedia = useCallback(
    (d: number) => {
      const nextI = mediaIndex + d;
      if (nextI < 0 || nextI >= mediaCount) return;
      // Steps closer together than ~90ms (a held key repeats every ~30–50ms) count
      // as rapid nav → snap. A short timer restores the slide once the burst ends.
      const now = performance.now();
      setFastNav(now - lastNavRef.current < 90);
      lastNavRef.current = now;
      if (navResetRef.current) clearTimeout(navResetRef.current);
      navResetRef.current = setTimeout(() => setFastNav(false), 110);
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
      if (navResetRef.current) clearTimeout(navResetRef.current);
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
        transition={closing ? CLOSE_FADE : FADE}
        onClick={requestClose}
      />

      {/* Ambient light streaks (decorative) */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-soft-light"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={closing ? CLOSE_FADE : { duration: 0.5 }}
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

      {/* Carousel stage. Two layers: a cohesive filmstrip that the user browses
          (every slide slides & scales together), and a hidden hero behind it that
          carries the shared-element layoutId so open/close morph to/from the grid
          card. Clipped to the area left of the panel. */}
      <div
        ref={stageRef}
        className="pointer-events-none absolute inset-y-0 left-0 right-0 overflow-hidden md:right-[340px]"
      >
        {/* Browse layer — the filmstrip. All visible slides animate to their new
            offset (translate + scale) together when the media index changes, so
            paging reads as one continuous carousel. On close it unmounts instantly
            and the hero morph of the *active* post takes over. */}
        {!closing ? (
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={post.id}
              className="absolute inset-0 z-30"
              // Group only carries the post-switch focus-pull now; per-slide opacity
              // (below) drives the entrance so peeks can appear before the morph ends.
              initial={{ opacity: 0, filter: switching ? "blur(12px)" : "blur(0px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              transition={{ opacity: FADE, filter: { duration: 0.34, ease: [0.23, 1, 0.32, 1] } }}
            >
              {media.map((m, i) => {
                const offset = i - mediaIndex;
                if (Math.abs(offset) > 2) return null;
                const isActive = offset === 0;
                const step = Math.abs(offset);
                const x = Math.sign(offset) * frameW * PEEK_OFFSET * (step === 1 ? 1 : 1.92);
                const scale = isActive ? 1 : PEEK_SCALE;
                const zIndex = isActive ? 30 : 20 - step;
                // Active slide stays hidden until the morph hands off (the hero owns
                // the centre); neighbours reveal on the quick `peeksIn` timer.
                const slideOpacity = isActive
                  ? phase === "in"
                    ? 0
                    : 1
                  : switching || !peeksIn
                    ? 0
                    : 1;
                return (
                  <motion.div
                    key={`slide-${i}`}
                    className={
                      isActive
                        ? "pointer-events-auto absolute left-1/2 top-1/2"
                        : "pointer-events-auto absolute left-1/2 top-1/2 cursor-pointer"
                    }
                    style={{ width: frameW, height: frameH, marginLeft: -frameW / 2, marginTop: -frameH / 2, zIndex }}
                    onClick={() => {
                      if (!isActive) setMediaIndex(i);
                    }}
                    initial={false}
                    animate={{ x: isActive ? 0 : x, scale, opacity: slideOpacity }}
                    transition={fastNav ? { duration: 0 } : { x: SLIDE, scale: SLIDE, opacity: FADE }}
                  >
                    <div className="relative size-full overflow-hidden rounded-[12px]" style={{ boxShadow: FRAME_SHADOW }}>
                      <StageImage
                        src={m.url}
                        poster={m.posterUrl}
                        kind={m.kind}
                        active={isActive && phase !== "in"}
                        // Resume from — and keep writing back — the grid card's
                        // position so open/close carries the clip over seamlessly.
                        startTime={isActive ? getVideoTime?.(post.id) : undefined}
                        onTime={
                          isActive && setVideoTime
                            ? (t) => setVideoTime(post.id, t)
                            : undefined
                        }
                        alt={isActive ? (post.caption ?? "") : ""}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        ) : null}

        {/* Morph layer — hidden during browse (opacity 0), visible only during the
            entrance morph. Holds the shared-element layoutId continuously while
            anchored, so unmounting it on close hands the morph straight to the grid
            card (no thrash, no re-add flash). */}
        {!closing ? (
          <motion.div
            className="pointer-events-none absolute left-1/2 top-1/2 z-20"
            style={{ width: frameW, height: frameH, marginLeft: -frameW / 2, marginTop: -frameH / 2 }}
            // Stays fully opaque behind the filmstrip and only fades out AFTER the
            // filmstrip has faded in on top — so the centre is never translucent
            // (no "see-through" flash to the grid during the hand-off).
            animate={{ opacity: phase === "in" ? 1 : 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1], delay: phase === "in" ? 0 : 0.24 }}
          >
            <motion.div
              layoutId={`post-${post.id}`}
              transition={OPEN_MORPH}
              onLayoutAnimationComplete={phase === "in" ? () => setPhase("browse") : undefined}
              className="relative size-full overflow-hidden rounded-[12px]"
            >
              <StageImage
                key={media[mediaIndex]?.url}
                src={media[mediaIndex]?.url}
                poster={media[mediaIndex]?.posterUrl}
                kind={media[mediaIndex]?.kind}
              />
            </motion.div>
          </motion.div>
        ) : null}
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

/**
 * Progressive media for the lightbox. For images it paints the (already grid-
 * cached) thumbnail instantly, then fades the full-quality render in on top the
 * moment it loads — so opening never shows a blank frame while the large image
 * streams in. For video/gif media it renders a muted, looping, controls-free
 * `<video>` that autoplays while it's the active (centre) slide and pauses
 * otherwise, over its poster so the still frame shows until playback starts.
 */
function StageImage({
  src,
  poster,
  alt = "",
  kind = "image",
  active = false,
  startTime,
  onTime,
}: {
  src?: string;
  poster?: string | null;
  alt?: string;
  kind?: MediaItem["kind"];
  active?: boolean;
  /** Seek here the moment the video starts, so it resumes rather than restarts. */
  startTime?: number;
  onTime?: (t: number) => void;
}) {
  const isVideo = kind === "video" || kind === "gif";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // Latest handoff position, read (not depended on) when playback starts so a
  // mid-play write never re-seeks the video.
  const startRef = useRef(startTime);
  useEffect(() => {
    startRef.current = startTime;
  }, [startTime]);

  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  // Only the centre slide plays; neighbours/hero rest on their poster.
  useEffect(() => {
    if (!isVideo) return;
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      const saved = startRef.current;
      if (saved != null && Number.isFinite(saved) && Math.abs(v.currentTime - saved) > 0.25) {
        try {
          v.currentTime = saved;
        } catch {
          /* not seekable yet — plays from wherever it is */
        }
      }
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isVideo, active, src]);

  if (isVideo) {
    return (
      <>
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 size-full select-none object-cover"
          />
        ) : null}
        <video
          ref={videoRef}
          src={src}
          poster={poster ?? undefined}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={alt || undefined}
          onTimeUpdate={onTime ? (e) => onTime(e.currentTarget.currentTime) : undefined}
          className="absolute inset-0 size-full select-none object-cover"
        />
      </>
    );
  }

  return (
    <>
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 size-full select-none object-cover"
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0 }}
        className="absolute inset-0 size-full select-none object-cover transition-opacity duration-300 ease-out"
      />
    </>
  );
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
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      whileTap={{ scale: 0.9 }}
      transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
      className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md transition-colors hover:bg-white/20 disabled:opacity-30"
    >
      {children}
    </motion.button>
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
