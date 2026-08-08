"use client";

import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { PostListItem } from "./queries";
import { cn } from "@/lib/utils";
import { PostOverlay } from "./post-overlay";
import { ColorSearch } from "./color-search";
import { searchByColorsAction } from "./color-search-action";
import { loadFeedPageAction } from "./feed-actions";
import { SetupRequired } from "@/components/setup-required";
import {
  initTiksOnFirstGesture,
  playOverlayOpen,
} from "@/lib/tiks-sounds";

export type PostsResult = { posts: PostListItem[]; error: string | null };

type Category = { slug: string; name: string };
type SortKey = "recent" | "oldest";

const FEED_PAGE_SIZE = 24;

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently",
  oldest: "Oldest",
};

/**
 * The public "The Internet Designs" explorer — a hero heading, a category
 * filter toolbar, and a Pinterest-style masonry of posts. Ported from Figma
 * (node 1:2). Light-only aesthetic using the design's literal palette.
 */
export function ExploreFeed({
  categories,
  postsPromise,
}: {
  categories: Category[];
  postsPromise: Promise<PostsResult>;
}) {
  const [active, setActive] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  // Selected search colours — when non-empty the grid below is replaced (in place,
  // no navigation) with colour-matched results.
  const [colors, setColors] = useState<string[]>([]);

  return (
    <MotionConfig reducedMotion="user">
      {/* Filter toolbar — rendered immediately (outside the grid's Suspense) so it
          never blanks out on refresh. Elevated (relative z-30) so its dropdowns
          paint above the grid; drop shadow gives the bar its crisp float. */}
      <div className="relative z-30 flex w-full flex-col items-start border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] ">
        {/* Toolbar row. On mobile it wraps to two rows — colour search + sort on
            top, the category rail full-width below — so nothing gets crushed.
            From `sm` up it collapses back to the original single, divider-
            separated row via flex order + nowrap. */}
        <div className="flex w-full flex-wrap items-center gap-x-3 px-2 sm:flex-nowrap sm:gap-x-4 sm:px-3.5">
          <div className="order-1 flex shrink-0 items-center py-2.5 sm:py-3.5">
            <ColorSearch selected={colors} onSelected={setColors} />
          </div>

          <Divider className="order-2 hidden sm:block" />

          {/* On mobile the rail sits on its own row, so it bleeds past the toolbar's
              horizontal padding — otherwise its top hairline stops short of the
              container's left/right borders. */}
          <PillRail
            categories={categories}
            active={active}
            onSelect={setActive}
            className="order-3 -mx-2 w-[calc(100%+1rem)] basis-[calc(100%+1rem)] border-t border-[#e3e5e8] sm:mx-0 sm:w-auto sm:basis-auto sm:flex-1 sm:border-0"
          />

          <Divider className="order-4 hidden sm:block" />

          <div className="order-2 ml-auto flex shrink-0 items-center py-2.5 sm:order-5 sm:ml-0 sm:py-3.5">
            <SortMenu value={sort} onChange={setSort} />
          </div>
        </div>
      </div>

      {/* Only the grid streams in — the bar above stays put */}
      <Suspense fallback={<GridSkeleton />}>
        <FeedBody
          postsPromise={postsPromise}
          active={active}
          sort={sort}
          colors={colors}
        />
      </Suspense>

      {/* Footer strip */}
      <div className="h-16 w-full shrink-0 border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]" />
    </MotionConfig>
  );
}

function GridBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-1 items-start gap-2.5 border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] p-2 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff] sm:p-3.5">
      {children}
    </div>
  );
}

function FeedBody({
  postsPromise,
  active,
  sort,
  colors,
}: {
  postsPromise: Promise<PostsResult>;
  active: string;
  sort: SortKey;
  colors: string[];
}) {
  const { posts: initialPosts, error } = use(postsPromise);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    initTiksOnFirstGesture();
  }, []);

  // Paginated feed — first page streams in via Suspense; further pages append as
  // the sentinel approaches the viewport. Category/sort resets to page 0.
  const [feedPosts, setFeedPosts] = useState<PostListItem[]>(initialPosts);
  const [hasMore, setHasMore] = useState(initialPosts.length >= FEED_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedBootstrapping, setFeedBootstrapping] = useState(false);
  const loadGen = useRef(0);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Adopt the streamed first page whenever the Suspense promise resolves to a new
  // one (adjust-during-render rather than an effect, so there's no extra paint).
  const [syncedInitial, setSyncedInitial] = useState(initialPosts);
  if (syncedInitial !== initialPosts) {
    setSyncedInitial(initialPosts);
    setFeedPosts(initialPosts);
    setHasMore(initialPosts.length >= FEED_PAGE_SIZE);
  }

  // Colour-matched results fetched in place. Stored tagged with the colour key so
  // we can tell fresh results from a previous search's (avoids showing stale posts
  // during a re-fetch) and only ever setState inside the async callback.
  const colorKey = colors.join(",");
  const [colorResult, setColorResult] = useState<{
    key: string;
    posts: PostListItem[];
  } | null>(null);

  useEffect(() => {
    if (colors.length === 0) return;
    let cancelled = false;
    const key = colorKey;
    searchByColorsAction(colors).then((res) => {
      if (!cancelled) setColorResult({ key, posts: res });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorKey]);

  // Refetch page 0 only when the category/sort actually change. Clearing a colour
  // search must NOT refetch — the feed is still in state, so it comes straight back
  // with no skeleton flash.
  const loadedFilterKey = useRef(`all|recent`);
  useEffect(() => {
    const filterKey = `${active}|${sort}`;
    if (loadedFilterKey.current === filterKey) return;
    loadedFilterKey.current = filterKey;

    const gen = ++loadGen.current;
    let cancelled = false;
    setFeedBootstrapping(true);
    setHasMore(true);
    loadFeedPageAction({ offset: 0, category: active, sort }).then((page) => {
      if (cancelled || loadGen.current !== gen) return;
      setFeedPosts(page);
      setHasMore(page.length >= FEED_PAGE_SIZE);
      setFeedBootstrapping(false);
    });
    return () => {
      cancelled = true;
    };
  }, [active, sort]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || colors.length > 0 || feedBootstrapping)
      return;
    const gen = loadGen.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await loadFeedPageAction({
        offset: feedPosts.length,
        category: active,
        sort,
      });
      if (loadGen.current !== gen) return;
      setFeedPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const next = page.filter((p) => !seen.has(p.id));
        return next.length ? [...prev, ...next] : prev;
      });
      setHasMore(page.length >= FEED_PAGE_SIZE);
    } finally {
      if (loadGen.current === gen) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [
    hasMore,
    colors.length,
    feedBootstrapping,
    feedPosts.length,
    active,
    sort,
  ]);

  // Prefetch the next page when the sentinel is ~800px from view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || colors.length > 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, colors.length, feedPosts.length, hasMore]);

  const colorActive = colors.length > 0;
  const colorReady = colorActive && colorResult?.key === colorKey;
  const colorLoading = colorActive && !colorReady;
  const colorPosts = colorReady ? colorResult!.posts : null;
  const refreshing = colorLoading || feedBootstrapping;

  // Arrowing to another post inside the lightbox pulls its shared element out of the
  // previous card's layout group, which makes that card play its close morph behind
  // the scrim — visible through the blur. Collapsing card layout transitions to zero
  // for that one commit hides it; the real close morph is restored a frame later.
  const [switchingPost, setSwitchingPost] = useState(false);
  useEffect(() => {
    if (!switchingPost) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setSwitchingPost(false));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [switchingPost]);

  const [mediaByPost, setMediaByPost] = useState<Record<string, number>>({});
  const setPostMedia = useCallback((postId: string, idx: number) => {
    setMediaByPost((m) => (m[postId] === idx ? m : { ...m, [postId]: idx }));
  }, []);

  const videoTimeRef = useRef<Record<string, number>>({});
  const getVideoTime = useCallback(
    (id: string) => videoTimeRef.current[id],
    [],
  );
  const setVideoTime = useCallback((id: string, t: number) => {
    videoTimeRef.current[id] = t;
  }, []);

  // While a colour search is in flight the existing feed stays on screen (dimmed)
  // instead of collapsing to skeletons; a category switch likewise keeps the old
  // posts up until the new page lands.
  const visible = useMemo(
    () => (colorActive ? (colorPosts ?? feedPosts) : feedPosts),
    [colorActive, colorPosts, feedPosts],
  );

  if (error) {
    return (
      <GridBox>
        <SetupRequired detail={error} />
      </GridBox>
    );
  }

  // Skeletons are a last resort — only when there is genuinely nothing to show.
  const showSkeleton = refreshing && visible.length === 0;

  return (
    <>
      <GridBox>
        <div className="w-full">
          {showSkeleton ? (
            <div className="w-full columns-1 gap-2.5 sm:columns-2 md:columns-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "mb-2.5 animate-pulse break-inside-avoid rounded-lg bg-[#ececee]",
                    i % 3 === 0 ? "h-64" : i % 3 === 1 ? "h-52" : "h-80",
                  )}
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState hasPosts={initialPosts.length > 0} colorSearch={colorActive} />
          ) : (
            <div
              className={cn(
                "w-full columns-1 gap-2.5 transition-opacity duration-200 sm:columns-2 md:columns-3 [column-fill:_balance]",
                refreshing && "opacity-55",
              )}
            >
              {visible.map((p, i) => (
                <MasonryCard
                  key={p.id}
                  post={p}
                  index={i}
                  onOpen={(i) => {
                    playOverlayOpen();
                    setOpenIndex(i);
                  }}
                  mediaIndex={mediaByPost[p.id] ?? 0}
                  onMediaIndex={(idx) => setPostMedia(p.id, idx)}
                  suspended={openIndex === i}
                  instantLayout={switchingPost}
                  getVideoTime={getVideoTime}
                  setVideoTime={setVideoTime}
                />
              ))}
            </div>
          )}

          {/* Infinite-scroll sentinel — starts fetching ~800px before it appears. */}
          {!colorActive && hasMore && !showSkeleton ? (
            <div ref={sentinelRef} className="w-full py-4" aria-hidden>
              {loadingMore ? (
                <div className="columns-1 gap-2.5 sm:columns-2 md:columns-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "mb-2.5 animate-pulse break-inside-avoid rounded-lg bg-[#ececee]",
                        i % 3 === 0 ? "h-64" : i % 3 === 1 ? "h-52" : "h-72",
                      )}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </GridBox>

      <AnimatePresence>
        {openIndex !== null ? (
          <PostOverlay
            key="post-overlay"
            posts={visible}
            index={openIndex}
            initialMediaIndex={mediaByPost[visible[openIndex]?.id] ?? 0}
            onIndexChange={(i) => {
              setSwitchingPost(true);
              setOpenIndex(i);
            }}
            onMediaIndex={setPostMedia}
            getVideoTime={getVideoTime}
            setVideoTime={setVideoTime}
            onClose={() => {
              const closedId = visible[openIndex]?.id;
              setOpenIndex(null);
              if (closedId) setPostMedia(closedId, 0);
            }}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function GridSkeleton() {
  return (
    <GridBox>
      <div className="w-full columns-1 gap-2.5 sm:columns-2 md:columns-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "mb-2.5 animate-pulse break-inside-avoid rounded-lg bg-[#ececee]",
              i % 3 === 0 ? "h-64" : i % 3 === 1 ? "h-52" : "h-80",
            )}
          />
        ))}
      </div>
    </GridBox>
  );
}

function Divider({ className }: { className?: string }) {
  // Full-height hairline with a 1px white bevel to its right (Figma node 12:162).
  return (
    <div
      className={cn(
        "w-px shrink-0 self-stretch bg-[#e3e5e8] shadow-[1px_0_0_0_rgba(255,255,255,0.9)]",
        className,
      )}
      aria-hidden
    />
  );
}

const POPOVER_SHADOW =
  "shadow-[0px_0px_0px_1px_rgba(0,0,0,0.06),0px_2px_6px_-2px_rgba(0,0,0,0.08),0px_14px_36px_-10px_rgba(0,0,0,0.22)]";

function PillRail({
  categories,
  active,
  onSelect,
  className,
}: {
  categories: Category[];
  active: string;
  onSelect: (slug: string) => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setEdges({
        left: el.scrollLeft > 4,
        right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [categories]);

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        ref={scrollRef}
        className="flex items-center gap-2 overflow-x-auto px-2 py-2.5 [scrollbar-width:none] sm:gap-3 sm:px-0 sm:py-3.5 [&::-webkit-scrollbar]:hidden"
      >
        <Pill
          label="All"
          active={active === "all"}
          onClick={() => onSelect("all")}
        />
        {categories.map((c) => (
          <Pill
            key={c.slug}
            label={c.name}
            active={active === c.slug}
            onClick={() => onSelect(c.slug)}
          />
        ))}
      </div>
      {/* Balanced edge fades — left appears once scrolled, right hides at the end */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#f7f7f7] to-transparent transition-opacity duration-200",
          edges.left ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#f7f7f7] to-transparent transition-opacity duration-200",
          edges.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

function Pill({
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
        "flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] tracking-tight shadow-[0_0_0_0.5px_rgba(0,0,0,0.09),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)] transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 sm:px-3.5 sm:py-2.5 sm:text-sm",
        active
          ? "bg-[#1f2123] text-[#eaebeb]"
          : "bg-[#f2f2f2] text-[#707275] hover:bg-[#ececec]",
      )}
    >
      {label}
    </button>
  );
}

function SortMenu({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative"
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-26 items-center justify-between overflow-hidden rounded-3xl bg-[#f9f9fa] p-2 text-[13px] tracking-tight text-[#1f2123] shadow-[0_0_0_1px_rgba(232,232,232,0.6),0_3px_9px_0_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)] sm:w-30 sm:p-2.5 sm:text-sm"
      >
        <span className="whitespace-nowrap">{SORT_LABELS[value]}</span>
        <ChevronDown
          className={cn(
            "size-3.5 text-[#5c5c5e] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            // Scales from the trigger (top-right), not centre — origin-aware
            // dropdown entrance, ease-out, 180ms (dropdown budget).
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: "top right" }}
            className={cn(
              "absolute right-0 top-full z-50 mt-1.5 w-26 overflow-hidden rounded-xl bg-white p-1 sm:w-30",
              POPOVER_SHADOW,
            )}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm tracking-tight transition-colors hover:bg-[#f2f2f2]",
                  value === k ? "text-[#1f2123]" : "text-[#707275]",
                )}
              >
                {SORT_LABELS[k]}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// Snappy spring for the hover media-nav pill — spatial, so a spring; short and
// low-bounce because it's a frequently-seen hover affordance (animation standards).
const NAV_SPRING = { type: "spring", duration: 0.34, bounce: 0.22 } as const;
const NAV_FADE = { duration: 0.22, ease: [0.23, 1, 0.32, 1] } as const;

// Directional crossfade for in-card media paging (custom = travel direction).
const CARD_SLIDE = {
  enter: (d: number) => ({ opacity: 0, x: d * 14 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -14 }),
} as const;

/**
 * Two-zone viewport presence for feed cards:
 * - `near` (~900px margin): warm/mount the video element before it scrolls in
 * - `inView` (~120px margin): actually autoplay; pause as soon as it leaves
 */
function useViewportPresence(enabled: boolean) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!enabled || !node) return;

    const nearIo = new IntersectionObserver(
      ([e]) => setNear(Boolean(e?.isIntersecting)),
      { rootMargin: "900px 0px" },
    );
    const playIo = new IntersectionObserver(
      ([e]) => setInView(Boolean(e?.isIntersecting)),
      { rootMargin: "120px 0px" },
    );
    nearIo.observe(node);
    playIo.observe(node);
    return () => {
      nearIo.disconnect();
      playIo.disconnect();
    };
  }, [enabled, node]);

  return { ref: setNode, near, inView };
}

/** Small skeuomorphic layout-preview widget from the toolbar (node 1:22). */
function MasonryCard({
  post,
  index,
  onOpen,
  mediaIndex,
  onMediaIndex,
  suspended,
  instantLayout,
  getVideoTime,
  setVideoTime,
}: {
  post: PostListItem;
  index: number;
  onOpen: (i: number) => void;
  mediaIndex: number;
  onMediaIndex: (idx: number) => void;
  /** True while this post is open in the lightbox — pause so it doesn't drift. */
  suspended: boolean;
  /** Snap layout changes instead of animating — used while the lightbox swaps posts. */
  instantLayout?: boolean;
  getVideoTime: (id: string) => number | undefined;
  setVideoTime: (id: string, t: number) => void;
}) {
  const aspectRatio =
    post.thumbnail?.width && post.thumbnail?.height
      ? `${post.thumbnail.width} / ${post.thumbnail.height}`
      : index % 3 === 0
        ? "720 / 900"
        : index % 3 === 1
          ? "1"
          : "1066 / 720";

  // The card can page through the post's media in place on hover. Media[0] keeps
  // using the light thumbnail (fast grid + the shared-element morph source);
  // deeper images pull their medium render only once the user pages to them.
  const media = post.images.length
    ? post.images
    : post.thumbnail
      ? [
          {
            url: post.thumbnail.url,
            posterUrl: null,
            kind: "image" as const,
            width: post.thumbnail.width,
            height: post.thumbnail.height,
          },
        ]
      : [];
  const mediaCount = media.length;
  const isGallery = mediaCount > 1;
  // The playable file for a video post (falls back to a gif-kind clip).
  const videoItem = post.hasVideo
    ? media.find((m) => m.kind === "video" || m.kind === "gif")
    : undefined;

  const { ref: viewportRef, near, inView } = useViewportPresence(Boolean(videoItem));

  // Clamp defensively — the shared map could hold a stale index after a filter change.
  const mediaIdx = Math.min(
    Math.max(mediaIndex, 0),
    Math.max(mediaCount - 1, 0),
  );
  const [hovered, setHovered] = useState(false);
  // Track the direction of the last page so the crossfade drifts the right way.
  const [dir, setDir] = useState(0);

  const page = (d: number) => {
    const next = mediaIdx + d;
    if (next < 0 || next >= mediaCount) return;
    setDir(d);
    onMediaIndex(next);
  };

  const activeSrc =
    mediaIdx === 0
      ? (post.thumbnail?.url ?? media[0]?.url)
      : media[mediaIdx]?.url;

  return (
    <motion.div
      ref={viewportRef}
      layoutId={`post-${post.id}`}
      transition={
        instantLayout
          ? { duration: 0 }
          : { type: "spring", duration: 0.4, bounce: 0.08 }
      }
      role="button"
      tabIndex={0}
      onClick={() => onOpen(index)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(index);
        }
      }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className={cn(
        "group relative mb-2.5 block cursor-pointer break-inside-avoid overflow-hidden rounded-lg border border-[#e3e5e8] bg-[#ededef]",
        suspended && "z-[60]",
      )}
      style={{ boxShadow: "none" }}
    >
      <div className="relative w-full" style={{ aspectRatio }}>
        {activeSrc ? (
          // Crossfade between images as the user pages. The active render slides a
          // hair in the travel direction so paging reads directional, not a flat dissolve.
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={mediaIdx}
              className="absolute inset-0"
              custom={dir}
              variants={CARD_SLIDE}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ opacity: NAV_FADE, x: NAV_SPRING }}
            >
              <Image
                src={activeSrc}
                alt={post.caption ?? post.title ?? ""}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover"
                priority={index < 4 && mediaIdx === 0}
              />
            </motion.div>
          </AnimatePresence>
        ) : null}

        {/* Video posts: mount the <video> only when near the viewport, and play
            only while in view (or hovered). Far-away cards keep the poster only
            so hundreds of clips never decode at once. */}
        {videoItem?.url && near ? (
          <CardVideo
            src={videoItem.url}
            poster={videoItem.posterUrl ?? post.thumbnail?.url ?? null}
            play={
              ((post.autoplayInFeed && inView) || hovered) && !suspended
            }
            postId={post.id}
            getVideoTime={getVideoTime}
            setVideoTime={setVideoTime}
          />
        ) : null}
      </div>

      {/* top-left: open affordance (hover) */}
      <span className="pointer-events-none absolute left-2.5 top-2.5 flex items-center rounded-full bg-[#c4c4c5]/60 p-1.5 opacity-0 shadow-[inset_0_0_53px_1px_rgba(255,255,255,0.25)] backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
        <ArrowUpRight className="size-4.5 text-white" strokeWidth={2.2} />
      </span>

      {/* top-right: hover media navigator for multi-image / video galleries */}
      {isGallery ? (
        <MediaNav
          count={mediaCount}
          index={mediaIdx}
          hovered={hovered}
          onPrev={() => page(-1)}
          onNext={() => page(1)}
        />
      ) : null}

      {/* bottom-left: creator avatar */}
      {post.creator.avatarUrl ? (
        <span className="absolute bottom-2.5 left-2.5 size-7.5 overflow-hidden rounded-full shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)]">
          <Image
            src={post.creator.avatarUrl}
            alt={post.creator.displayName}
            width={30}
            height={30}
            className="size-full object-cover"
          />
        </span>
      ) : null}
    </motion.div>
  );
}

/**
 * Feed video — muted, looping, no controls. Plays when `play` is true (the admin
 * autoplay setting, or while the card is hovered) and pauses otherwise, fading to
 * the poster so the still frame stays sharp under the grid's shared-element morph.
 */
function CardVideo({
  src,
  poster,
  play,
  postId,
  getVideoTime,
  setVideoTime,
}: {
  src: string;
  poster?: string | null;
  play: boolean;
  postId: string;
  getVideoTime: (id: string) => number | undefined;
  setVideoTime: (id: string, t: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (play) {
      // Resume from the shared position (set by the lightbox, or a prior hover) so
      // playback carries over instead of restarting.
      const saved = getVideoTime(postId);
      if (
        saved != null &&
        Number.isFinite(saved) &&
        Math.abs(v.currentTime - saved) > 0.25
      ) {
        try {
          v.currentTime = saved;
        } catch {
          /* not seekable yet — will play from 0 */
        }
      }
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [play, postId, getVideoTime]);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster ?? undefined}
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden
      onTimeUpdate={(e) => setVideoTime(postId, e.currentTarget.currentTime)}
      className={cn(
        "pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-300",
        play ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

/**
 * Hover media navigator (Figma node 26:75). At rest it's the compact count pill.
 * On card hover the chevrons expand out from the sides — only the pill's *width*
 * grows (each chevron animates its own width 0 → full), so the number itself never
 * scales, it just gets flanked. Each chevron fills with a grey disc on its own
 * hover, and clicks page the card's media without opening the lightbox.
 */
function MediaNav({
  count,
  index,
  hovered,
  onPrev,
  onNext,
}: {
  count: number;
  index: number;
  hovered: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="pointer-events-auto absolute right-2.5 top-2.5 flex items-center rounded-full bg-[#c4c4c5]/65 p-0.5 px-1.5 text-white shadow-[0_0_0_0.3px_rgba(0,0,0,0.06),0_3px_6px_-2px_rgba(0,0,0,0.04),inset_0_0_53px_1px_rgba(255,255,255,0.25)] backdrop-blur-[2px]"
    >
      <NavChevron
        side="left"
        show={hovered}
        disabled={index === 0}
        onClick={onPrev}
      />

      <span className="min-w-5 px-1 text-center text-[15px] font-medium leading-none tabular-nums tracking-tight">
        {hovered ? index + 1 : count}
      </span>

      <NavChevron
        side="right"
        show={hovered}
        disabled={index === count - 1}
        onClick={onNext}
      />
    </div>
  );
}

function NavChevron({
  side,
  show,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  show: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <motion.button
      type="button"
      aria-label={side === "left" ? "Previous image" : "Next image"}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      // Width animates 0 → 28px so the pill only grows sideways — the number never
      // scales. Overflow-clip hides the icon while collapsed.
      initial={false}
      animate={{ width: show ? 28 : 0, opacity: show ? 1 : 0 }}
      transition={NAV_SPRING}
      whileTap={disabled || !show ? undefined : { scale: 0.86 }}
      className="flex h-7 shrink-0 items-center justify-center overflow-clip rounded-full transition-colors duration-150 hover:bg-[#b7b7b8] disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2.4} />
    </motion.button>
  );
}

function EmptyState({
  hasPosts,
  colorSearch,
}: {
  hasPosts: boolean;
  colorSearch?: boolean;
}) {
  return (
    <div className="flex w-full flex-col items-center justify-center py-24 text-center">
      <h2 className="text-base font-medium text-[#1f2123]">
        {colorSearch
          ? "No designs match those colours"
          : hasPosts
            ? "Nothing in this category yet"
            : "No inspiration yet"}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-[#707275]">
        {colorSearch
          ? "Try picking a different or lighter shade."
          : hasPosts
            ? "Try a different filter to see more designs."
            : "Add posts from the admin panel to start populating the feed."}
      </p>
    </div>
  );
}
