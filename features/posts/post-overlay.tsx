"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { PostListItem } from "./queries";
import { cn } from "@/lib/utils";
import { OverlayMediaNav, overlayNavLabels } from "./media-nav-pill";
import { CaptionText } from "./caption-text";
import { ColorSwatches } from "./color-swatches";
import {
  playMediaSwitch,
  playOverlayClose,
  playPostSwitch,
} from "@/lib/tiks-sounds";
import { cleanCaptionForDisplay } from "@/lib/providers/tweet/clean-caption";

const SOURCE_LABELS: Record<PostListItem["source"], string> = {
  x: "X",
  threads: "Threads",
  instagram: "Instagram",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  dribbble: "Dribbble",
  behance: "Behance",
};

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
// Phones have far less room either side, so neighbours ride closer in to stay visible.
const PEEK_OFFSET_MOBILE = 0.98;
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
  const navShakeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [navShake, setNavShake] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 767px)").matches
        : false,
  );
  const [stage, setStage] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1200,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Reset to the first media the instant the active post changes — during render
  // (guarded) so there's no stale-index flash.
  const [seenIndex, setSeenIndex] = useState(index);
  if (seenIndex !== index) {
    setSeenIndex(index);
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
    playOverlayClose();
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
      playMediaSwitch();
    },
    [mediaIndex, mediaCount],
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current;
      if (!start) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      touchStartRef.current = null;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      goMedia(dx < 0 ? 1 : -1);
    },
    [goMedia],
  );

  const bumpNav = useCallback(() => {
    setNavShake(true);
    if (navShakeRef.current) clearTimeout(navShakeRef.current);
    navShakeRef.current = setTimeout(() => setNavShake(false), 420);
  }, []);

  const goPost = useCallback(
    (d: number) => {
      const nextI = index + d;
      if (nextI < 0 || nextI >= posts.length) return;
      playPostSwitch();
      onIndexChange(nextI);
    },
    [index, posts.length, onIndexChange],
  );

  // Navigation is one-dimensional: step through the post's media, then roll over to
  // the neighbouring post once you run off either end.
  const goBack = useCallback(() => {
    if (mediaIndex > 0) goMedia(-1);
    else if (index > 0) goPost(-1);
    else bumpNav();
  }, [mediaIndex, index, goMedia, goPost, bumpNav]);

  const goForward = useCallback(() => {
    if (mediaIndex < mediaCount - 1) goMedia(1);
    else if (index < posts.length - 1) goPost(1);
    else bumpNav();
  }, [mediaIndex, mediaCount, index, posts.length, goMedia, goPost, bumpNav]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestClose();
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault(); // don't let arrows scroll the page / panel
      }
      if (e.key === "ArrowLeft") goBack();
      else if (e.key === "ArrowRight") goForward();
      else if (e.key === "ArrowUp") goPost(-1);
      else if (e.key === "ArrowDown") goPost(1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      if (navResetRef.current) clearTimeout(navResetRef.current);
      if (navShakeRef.current) clearTimeout(navShakeRef.current);
      document.body.style.overflow = prevOverflow;
    };
  }, [goBack, goForward, goPost, requestClose]);

  if (!post) return null;

  const atStart = mediaIndex === 0 && index === 0;
  const atEnd = mediaIndex >= mediaCount - 1 && index === posts.length - 1;

  const aspect =
    media[0]?.width && media[0]?.height ? media[0].width / media[0].height : 4 / 3;
  // Mobile keeps the frame narrower than the stage so the previous/next media peek
  // in at both edges exactly like desktop, rather than sitting on a flat backdrop.
  let frameW = stage.w * (isMobile ? 0.92 : 0.58);
  let frameH = frameW / aspect;
  // Mobile: taller frame — compact info drawer leaves room for the preview.
  const maxH = stage.h * (isMobile ? 0.58 : 0.8);
  if (frameH > maxH) {
    frameH = maxH;
    frameW = frameH * aspect;
  }
  const peekOffset = isMobile ? PEEK_OFFSET_MOBILE : PEEK_OFFSET;

  const mediaLabel = overlayNavLabels({
    mediaIndex,
    mediaCount,
  });

  const overlay = (
    <div className="fixed inset-0 z-[100] flex flex-col md:block">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/30 backdrop-blur-[16px]"
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

      {/* Carousel stage. On mobile it fills the top flex region; on desktop it
          sits left of the info sidebar. Two layers: a filmstrip the user browses,
          and a hidden hero behind it that carries the shared-element layoutId. */}
      <div
        ref={stageRef}
        className="pointer-events-none relative z-10 min-h-0 flex-1 overflow-hidden md:absolute md:inset-y-0 md:left-0 md:right-[340px]"
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
                const x = Math.sign(offset) * frameW * peekOffset * (step === 1 ? 1 : 1.92);
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
                        ? "pointer-events-auto absolute left-1/2 top-1/2 touch-pan-y"
                        : "pointer-events-auto absolute left-1/2 top-1/2 cursor-pointer touch-pan-y"
                    }
                    style={{ width: frameW, height: frameH, marginLeft: -frameW / 2, marginTop: -frameH / 2, zIndex }}
                    onClick={() => {
                      if (!isActive) goMedia(i - mediaIndex);
                    }}
                    onTouchStart={mediaCount > 1 ? handleTouchStart : undefined}
                    onTouchEnd={mediaCount > 1 ? handleTouchEnd : undefined}
                    initial={false}
                    animate={{
                      x: isActive ? 0 : x,
                      scale,
                      opacity: slideOpacity,
                    }}
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
                        alt={
                          isActive && post.caption
                            ? cleanCaptionForDisplay(post.caption)
                            : ""
                        }
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
            {/* Keyed by post id so switching posts inside the lightbox remounts this
                element with a clean shared-element identity. Without the key Motion
                keeps the association made on open, and closing would morph back to
                the post you first clicked instead of the one you're looking at. */}
            <motion.div
              key={post.id}
              layoutId={`post-${post.id}`}
              // Only the initial open earns the morph; re-anchoring to a post you
              // arrowed to happens behind the scrim and should be instant.
              transition={switching ? { duration: 0 } : OPEN_MORPH}
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

        {/* The overlay's only chrome: one pair of arrows under the frame. They page
            through the post's media, then roll over to the previous/next post at the
            ends — same rule as the ← → keys. */}
        {!closing && phase === "browse" ? (
          <motion.div
            className="pointer-events-auto absolute inset-x-0 bottom-4 z-40 flex items-center justify-center sm:bottom-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={FADE}
          >
            <OverlayMediaNav
              shake={navShake}
              atStart={atStart}
              atEnd={atEnd}
              mediaLabel={mediaLabel}
              onBack={goBack}
              onForward={goForward}
            />
          </motion.div>
        ) : null}
      </div>

      {/* Info — bottom drawer on mobile, right sidebar on desktop */}
      <motion.aside
        className={cn(
          "z-30 flex shrink-0 flex-col bg-[#f7f7f7]",
          "rounded-t-2xl border-t border-[#e3e5e8] shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)]",
          "md:absolute md:inset-y-0 md:right-0 md:w-[340px] md:overflow-y-auto md:rounded-none md:border-l md:border-t-0 md:p-4 md:shadow-none",
        )}
        initial={isMobile ? { y: "100%", opacity: 0 } : { x: 360, opacity: 0 }}
        animate={
          isMobile
            ? { y: closing ? "100%" : 0, opacity: closing ? 0 : 1 }
            : { x: closing ? 360 : 0, opacity: closing ? 0 : 1 }
        }
        transition={DRAWER}
      >
        <PostInfoContent post={post} compact={isMobile} onClose={requestClose} />
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

function PostInfoContent({
  post,
  compact = false,
  onClose,
}: {
  post: PostListItem;
  compact?: boolean;
  onClose?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    Boolean(post.caption) ||
    Boolean(post.sourceUrl) ||
    post.categories.length > 0 ||
    post.colors.length > 0 ||
    Boolean(post.interaction);

  useEffect(() => {
    setExpanded(false);
  }, [post.id]);

  const creatorRow = (
    <a
      href={post.creator.profileUrl ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-center gap-3"
    >
      {post.creator.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.creator.avatarUrl}
          alt={post.creator.displayName}
          className="size-10 shrink-0 rounded-full object-cover md:size-[42px]"
          draggable={false}
        />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e3e5e8] text-sm font-medium text-[#707275] md:size-[42px]">
          {post.creator.displayName?.[0] ?? "?"}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold tracking-tight text-[#1f2123] md:text-base">
          {post.creator.displayName}
        </span>
        <span className="truncate text-sm tracking-tight text-[#707275] md:text-base">
          @{post.creator.username}
        </span>
      </div>
    </a>
  );

  /** Figma 58:2608 — Source / Category / Colors / Interaction (no Tags). */
  const metaRows = (
    <div className="flex flex-col">
      <Row label="Source">
        <Link
          href={post.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 text-black hover:underline"
        >
          {SOURCE_LABELS[post.source] ?? "X"}
          <ExternalLink className="size-3.5" />
        </Link>
      </Row>
      {post.categories[0] ? (
        <Row label="Category">
          <span className="text-black">{post.categories[0].name}</span>
        </Row>
      ) : null}
      <Row label="Colors">
        <ColorSwatches colors={post.colors} />
      </Row>
      {post.interaction ? (
        <Row label="Interaction">
          <span className="text-black">{post.interaction}</span>
        </Row>
      ) : null}
    </div>
  );

  const detailsBlock = (
    <motion.div
      key={`details-${post.id}`}
      initial={compact ? { height: 0, opacity: 0 } : false}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      className="overflow-hidden"
    >
      <div className="flex flex-col gap-3.5 pt-3 md:pt-0">
        {post.caption ? (
          <CaptionText
            text={post.caption}
            excludeUrls={[post.sourceUrl]}
            className="text-[15px] leading-5 tracking-tight text-[#222426] md:text-base"
          />
        ) : null}
        {metaRows}
      </div>
    </motion.div>
  );

  if (!compact) {
    return (
      <div className="flex flex-col gap-4">
        <motion.div
          key={post.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={FADE}
          className="flex flex-col gap-3.5"
        >
          {creatorRow}
          {post.caption ? (
            <CaptionText
              text={post.caption}
              excludeUrls={[post.sourceUrl]}
              className="text-base leading-5 tracking-tight text-[#222426]"
            />
          ) : null}
        </motion.div>
        {metaRows}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col px-4 pb-4 pt-2",
        expanded && "max-h-[46vh] overflow-y-auto",
      )}
    >
      <button
        type="button"
        onClick={() => (expanded ? setExpanded(false) : onClose?.())}
        aria-label={expanded ? "Hide details" : "Close"}
        className="mx-auto mb-2 flex h-5 w-full shrink-0 items-center justify-center rounded-full active:opacity-70 motion-reduce:active:opacity-100"
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-[#d1d3d6]" />
      </button>

      <motion.div
        key={post.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={FADE}
      >
        {creatorRow}
      </motion.div>

      {post.caption && !expanded ? (
        <div className="mt-2 line-clamp-2 overflow-hidden text-[15px] leading-5 tracking-tight text-[#222426]">
          <CaptionText
            text={post.caption}
            excludeUrls={[post.sourceUrl]}
            className="line-clamp-2"
          />
        </div>
      ) : null}

      {hasDetails ? (
        <div className="mt-2 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-between py-1.5 text-left active:opacity-70 motion-reduce:active:opacity-100"
          >
            <span className="text-sm font-medium tracking-tight text-[#707275]">
              {expanded ? "Hide details" : "About this design"}
            </span>
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="flex size-7 items-center justify-center text-[#707275]"
            >
              <ChevronDown className="size-4" strokeWidth={2.2} />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {expanded ? detailsBlock : null}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
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
