"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ArrowUpRight, Check, ChevronDown } from "lucide-react";
import type { PostListItem, FeedSort } from "./queries";
import { cn } from "@/lib/utils";
import { PostOverlay } from "./post-overlay";
import { ColorSearch } from "./color-search";
import { FeedMediaNav, NAV_OPEN_AFFORDANCE_CLASS } from "./media-nav-pill";
import { searchByColorsAction } from "./color-search-action";
import { loadFeedPageAction } from "./feed-actions";
import { SetupRequired } from "@/components/setup-required";
import {
  initTiksOnFirstGesture,
  playMediaSwitch,
  playOverlayOpen,
} from "@/lib/tiks-sounds";
import { cleanCaptionForDisplay } from "@/lib/providers/tweet/clean-caption";
import {
  MasonryGrid,
  postAspectRatioValue,
  useMasonryLayout,
  useMasonryReady,
  useResponsiveMasonryBuckets,
} from "./masonry-grid";

type Category = { slug: string; name: string };
type SortKey = FeedSort;

type FeedPageCache = { posts: PostListItem[]; hasMore: boolean };

/** Survives ExploreFeed remounts within the same JS realm (soft navigations). */
const feedPageCache = new Map<string, FeedPageCache>();
const feedInflight = new Map<string, Promise<FeedPageCache>>();
const DEFAULT_FILTER_KEY = "all|recent";
const EMPTY_POSTS: PostListItem[] = [];

const FEED_PAGE_SIZE = 24;

function asPostList(value: unknown): PostListItem[] {
  return Array.isArray(value) ? (value as PostListItem[]) : EMPTY_POSTS;
}

function filterCacheKey(category: string, sort: SortKey): string {
  return `${category}|${sort}`;
}

/** Ignore stale empty cache entries — `[]` is truthy but must not beat server props. */
function cachedPostsForKey(key: string): PostListItem[] | null {
  const posts = asPostList(feedPageCache.get(key)?.posts);
  return posts.length > 0 ? posts : null;
}

function warmThumbnails(posts: PostListItem[]) {
  if (typeof window === "undefined") return;
  for (const post of posts.slice(0, 9)) {
    const url = post.thumbnail?.url;
    if (!url) continue;
    const img = new window.Image();
    img.decoding = "async";
    img.src = url;
  }
}

/** Fetch (or reuse) page 0 for a filter. Populates the module cache. */
function prefetchFeedPage(
  category: string,
  sort: SortKey,
): Promise<FeedPageCache> {
  const key = filterCacheKey(category, sort);
  const cached = feedPageCache.get(key);
  if (cached && asPostList(cached.posts).length > 0) {
    return Promise.resolve(cached);
  }
  const pending = feedInflight.get(key);
  if (pending) return pending;

  const request = loadFeedPageAction({ offset: 0, category, sort })
    .then((raw) => {
      const page = asPostList(raw);
      const prev = feedPageCache.get(key);
      const prevPosts = asPostList(prev?.posts);
      // Keep a longer cached list if page-0 still matches its head.
      const headMatches =
        page.length > 0 &&
        prevPosts.length >= page.length &&
        page.every((p, i) => p.id === prevPosts[i]?.id);
      const next: FeedPageCache = headMatches
        ? {
            posts: prevPosts,
            hasMore: prev?.hasMore ?? page.length >= FEED_PAGE_SIZE,
          }
        : { posts: page, hasMore: page.length >= FEED_PAGE_SIZE };
      feedPageCache.set(key, next);
      warmThumbnails(next.posts);
      return next;
    })
    .finally(() => {
      feedInflight.delete(key);
    });

  feedInflight.set(key, request);
  return request;
}

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently",
  hidden_gems: "Hidden Gems",
  featured: "Featured",
  oldest: "Oldest",
};

const SORT_ORDER: SortKey[] = ["recent", "hidden_gems", "featured", "oldest"];

const SORT_MENU_WIDTH = "w-[176px]";

/** Paper colour-tag segment — matches ColorSearch toolbar chips */
const TAG_SEGMENT_SHADOW =
  "shadow-[0_0_0_1px_rgba(232,232,232,0.6),0_3px_9px_0_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)]";

const GITHUB_REPO_URL = "https://github.com/iurvish/theinternetdesigns";

/**
 * Figma 166-230 / Paper Frame 7 — grey stroke on L+R+B, white inset bevel on
 * all four inner edges. Top grey comes from the hero's bottom border.
 */
const FIGMA_TOOLBAR_SHEET =
  "border-x border-b border-[#e3e5e8] bg-[#f7f7f7] shadow-[inset_1px_0_0_0_#fff,inset_-1px_0_0_0_#fff,inset_0_1px_0_0_#fff,inset_0_-1px_0_0_#fff]";

/** Mobile only — inner row divider (grey + white bevel above the line) */
const MOBILE_ROW_SPLIT =
  "border-b border-[#e3e5e8] shadow-[inset_0_-1px_0_0_#fff]";

/**
 * The public "The Internet Designs" explorer — a hero heading, a category
 * filter toolbar, and a row-first masonry feed (newest across the top).
 * Fullscreen shared-element morph is preserved; feed cards use `layout={false}`
 * so they never animate on load.
 *
 * Initial posts arrive already resolved from the server (no client Suspense /
 * use(promise)). Category pages are prefetched on idle + hover so first clicks
 * hit cache. Uncached switches swap to a skeleton instead of keeping the old grid.
 */
export function ExploreFeed({
  categories,
  initialPosts,
  error = null,
}: {
  categories: Category[];
  initialPosts?: PostListItem[] | null;
  error?: string | null;
}) {
  const [active, setActive] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  // Selected search colours — when non-empty the grid below is replaced (in place,
  // no navigation) with colour-matched results.
  const [colors, setColors] = useState<string[]>([]);
  const safeInitialPosts = asPostList(initialPosts);

  const prefetchCategory = useCallback(
    (slug: string) => {
      void prefetchFeedPage(slug, sort);
    },
    [sort],
  );

  // Warm every category for the current sort after idle so first clicks are cache hits.
  useEffect(() => {
    const slugs = ["all", ...categories.map((c) => c.slug)];
    let cancelled = false;
    let cursor = 0;
    let timeout = 0;

    const tick = () => {
      if (cancelled) return;
      const batch: string[] = [];
      while (cursor < slugs.length && batch.length < 3) {
        const slug = slugs[cursor++]!;
        if (cachedPostsForKey(filterCacheKey(slug, sort))) {
          continue;
        }
        batch.push(slug);
      }
      if (batch.length === 0) return;
      void Promise.all(batch.map((slug) => prefetchFeedPage(slug, sort))).then(
        () => {
          if (!cancelled) timeout = window.setTimeout(tick, 50);
        },
      );
    };

    const start = () => {
      if (cancelled) return;
      timeout = window.setTimeout(tick, 600);
    };

    let idleId = 0;
    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(start, { timeout: 2500 });
    } else {
      timeout = window.setTimeout(start, 1200);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (idleId && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleId);
      }
    };
  }, [categories, sort, active]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex w-full flex-1 flex-col bg-[#f7f7f7]">
        {/* Plain positioning wrapper — all chrome lives on the inner sheet.
            Elevated so dropdowns paint above the grid. */}
        <div className="relative z-30 w-full shrink-0">
          <div className={FIGMA_TOOLBAR_SHEET}>
            {/* Mobile — two rows: controls, then categories */}
            <div className="flex flex-col sm:hidden">
              <div
                className={cn(
                  "flex items-center justify-between gap-3 px-2 py-3.5",
                  MOBILE_ROW_SPLIT,
                )}
              >
                <ColorSearch selected={colors} onSelected={setColors} />
                <div className="flex shrink-0 items-center gap-2">
                  <SortMenu
                    value={sort}
                    onChange={setSort}
                    onPrefetch={(next) => void prefetchFeedPage(active, next)}
                  />
                  <GitHubStarLink />
                </div>
              </div>
              <PillRail
                categories={categories}
                active={active}
                onSelect={setActive}
                onPrefetch={prefetchCategory}
              />
            </div>

            {/* Desktop — single row: colour | categories | filter */}
            <div className="hidden items-stretch gap-x-4 px-3.5 sm:flex">
              <div className="flex shrink-0 items-center py-3.5">
                <ColorSearch selected={colors} onSelected={setColors} />
              </div>

              <Divider />

              <PillRail
                categories={categories}
                active={active}
                onSelect={setActive}
                onPrefetch={prefetchCategory}
                className="min-w-0 flex-1"
              />

              <Divider />

              <div className="flex shrink-0 items-center gap-2 py-3.5">
                <SortMenu
                  value={sort}
                  onChange={setSort}
                  onPrefetch={(next) => void prefetchFeedPage(active, next)}
                />
                <GitHubStarLink />
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 w-full flex-1 flex-col">
          <FeedBody
            initialPosts={safeInitialPosts}
            error={error}
            active={active}
            sort={sort}
            colors={colors}
          />
        </div>

        {/* Footer strip */}
        <div className="h-16 w-full shrink-0 border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]" />
      </div>
    </MotionConfig>
  );
}

function GridBox({
  children,
  fill,
}: {
  children: React.ReactNode;
  /** Stretch to fill remaining viewport when the feed is empty. */
  fill?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full gap-2.5 border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] p-2 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff] sm:p-3.5",
        fill ? "min-h-[50vh] flex-1 items-stretch" : "items-start",
      )}
    >
      {children}
    </div>
  );
}

function FeedBody({
  initialPosts: initialPostsProp,
  error,
  active,
  sort,
  colors,
}: {
  initialPosts: PostListItem[];
  error: string | null;
  active: string;
  sort: SortKey;
  colors: string[];
}) {
  // Guard against undefined during HMR / stale call sites after the
  // postsPromise → initialPosts rename.
  const initialPosts = asPostList(initialPostsProp);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    initTiksOnFirstGesture();
  }, []);

  // Paginated feed — seed from server props so SSR HTML matches hydration.
  // Module cache may hold a stale empty `[]` from a prior filter; never let
  // that override a non-empty `initialPosts` page from the server.
  const [feedPosts, setFeedPosts] = useState<PostListItem[]>(() => {
    if (initialPosts.length > 0) {
      feedPageCache.set(DEFAULT_FILTER_KEY, {
        posts: initialPosts,
        hasMore: initialPosts.length >= FEED_PAGE_SIZE,
      });
      return initialPosts;
    }
    return cachedPostsForKey(DEFAULT_FILTER_KEY) ?? initialPosts;
  });
  const [hasMore, setHasMore] = useState(() => {
    if (initialPosts.length > 0) {
      return initialPosts.length >= FEED_PAGE_SIZE;
    }
    const cached = feedPageCache.get(DEFAULT_FILTER_KEY);
    return cached?.hasMore ?? false;
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedBootstrapping, setFeedBootstrapping] = useState(false);
  const loadGen = useRef(0);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Tracks the filter whose page is currently in `feedPosts`.
  const loadedFilterKey = useRef(DEFAULT_FILTER_KEY);

  // After hydration: adopt a refreshed default page, or restore a longer
  // client-fetched page from cache on soft remounts — never during render
  // (reference changes on deserialized props caused hydration mismatches).
  useEffect(() => {
    if (active !== "all" || sort !== "recent") return;

    const cachedPosts = asPostList(
      feedPageCache.get(DEFAULT_FILTER_KEY)?.posts,
    );
    const keepLonger = cachedPosts.length > initialPosts.length;

    if (keepLonger) {
      setFeedPosts(cachedPosts);
      setHasMore(Boolean(feedPageCache.get(DEFAULT_FILTER_KEY)?.hasMore));
      loadedFilterKey.current = DEFAULT_FILTER_KEY;
      setFeedBootstrapping(false);
      return;
    }

    setFeedPosts((prev) => {
      if (
        prev.length === initialPosts.length &&
        prev.every((p, i) => p.id === initialPosts[i]?.id)
      ) {
        return prev;
      }
      return initialPosts;
    });
    setHasMore(initialPosts.length >= FEED_PAGE_SIZE);
    feedPageCache.set(DEFAULT_FILTER_KEY, {
      posts: initialPosts,
      hasMore: initialPosts.length >= FEED_PAGE_SIZE,
    });
    loadedFilterKey.current = DEFAULT_FILTER_KEY;
    setFeedBootstrapping(false);
  }, [initialPosts, active, sort]);

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

  // Swap the grid when category/sort change. Cached pages paint instantly;
  // uncached first visits show a skeleton instead of the previous category.
  useEffect(() => {
    const key = filterCacheKey(active, sort);
    if (loadedFilterKey.current === key) return;

    const cachedPosts = cachedPostsForKey(key);
    if (cachedPosts) {
      loadedFilterKey.current = key;
      setFeedPosts(cachedPosts);
      setHasMore(Boolean(feedPageCache.get(key)?.hasMore));
      setFeedBootstrapping(false);
      const gen = ++loadGen.current;
      let cancelled = false;
      prefetchFeedPage(active, sort).then(
        (next) => {
          if (cancelled || loadGen.current !== gen) return;
          setFeedPosts(next.posts);
          setHasMore(next.hasMore);
        },
        () => {},
      );
      return () => {
        cancelled = true;
      };
    }

    const gen = ++loadGen.current;
    let cancelled = false;
    setFeedPosts([]);
    setHasMore(false);
    setFeedBootstrapping(true);
    prefetchFeedPage(active, sort).then(
      (next) => {
        if (cancelled || loadGen.current !== gen) return;
        loadedFilterKey.current = key;
        setFeedPosts(next.posts);
        setHasMore(next.hasMore);
        setFeedBootstrapping(false);
      },
      () => {
        if (cancelled || loadGen.current !== gen) return;
        setFeedBootstrapping(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, sort]);

  const loadMore = useCallback(async () => {
    if (
      loadingMoreRef.current ||
      !hasMore ||
      colors.length > 0 ||
      feedBootstrapping
    )
      return;
    const gen = loadGen.current;
    const filterKey = `${active}|${sort}`;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = asPostList(
        await loadFeedPageAction({
          offset: feedPosts.length,
          category: active,
          sort,
        }),
      );
      if (loadGen.current !== gen) return;
      setFeedPosts((prev) => {
        const safePrev = asPostList(prev);
        const seen = new Set(safePrev.map((p) => p.id));
        const next = page.filter((p) => !seen.has(p.id));
        const merged = next.length ? [...safePrev, ...next] : safePrev;
        feedPageCache.set(filterKey, {
          posts: merged,
          hasMore: page.length >= FEED_PAGE_SIZE,
        });
        return merged;
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

  // Colour search keeps the existing feed on screen (dimmed) while results load.
  // Category switches with no cache swap to a skeleton via empty feedPosts.
  const visible = useMemo(() => {
    if (colorActive) return asPostList(colorPosts ?? feedPosts);
    return asPostList(feedPosts);
  }, [colorActive, colorPosts, feedPosts]);

  const layoutReady = useMasonryReady();
  const columnCount = useMasonryLayout();
  const aspectRatios = useMemo(
    () => visible.map((p, i) => postAspectRatioValue(p, i)),
    [visible],
  );
  const {
    one: buckets1,
    two: buckets2,
    three: buckets3,
  } = useResponsiveMasonryBuckets(aspectRatios);

  const mapBuckets = (buckets: number[][], mode: "static" | "interactive") =>
    buckets.map((indices) =>
      indices.map((i) => {
        const p = visible[i]!;
        if (mode === "static") {
          return <StaticFeedCard key={p.id} post={p} index={i} />;
        }
        return (
          <MasonryCard
            key={p.id}
            post={p}
            index={i}
            onOpen={(idx) => {
              playOverlayOpen();
              setOpenIndex(idx);
            }}
            mediaIndex={mediaByPost[p.id] ?? 0}
            onMediaIndex={(idx) => setPostMedia(p.id, idx)}
            suspended={openIndex === i}
            instantLayout={switchingPost}
            getVideoTime={getVideoTime}
            setVideoTime={setVideoTime}
          />
        );
      }),
    );

  if (error) {
    return (
      <GridBox fill>
        <SetupRequired detail={error} />
      </GridBox>
    );
  }

  // Skeletons only when there is genuinely nothing to paint yet (first empty
  // load). Filter changes with posts on screen never take this path.
  const showSkeleton = refreshing && visible.length === 0;
  const isEmpty = !showSkeleton && visible.length === 0;

  // Same row-first buckets at every breakpoint. SSR paints static cards; after
  // hydration the active breakpoint upgrades in place — positions never change.
  const modeFor = (cols: number): "static" | "interactive" =>
    layoutReady && columnCount === cols ? "interactive" : "static";

  const columnsFor = (cols: 1 | 2 | 3, buckets: number[][]) => {
    // After hydration, drop inactive breakpoint trees so images/layoutIds
    // only exist once. SSR keeps all three so CSS can show the right one.
    if (layoutReady && columnCount !== cols) {
      return Array.from({ length: cols }, () => [] as ReactNode[]);
    }
    return mapBuckets(buckets, modeFor(cols));
  };

  return (
    <>
      <GridBox fill={isEmpty}>
        <div
          className={cn(
            "w-full",
            isEmpty && "flex min-h-[50vh] flex-1 flex-col",
          )}
        >
          {showSkeleton ? (
            <GridSkeletonColumns />
          ) : isEmpty ? (
            <EmptyState
              hasPosts={initialPosts.length > 0}
              colorSearch={colorActive}
            />
          ) : (
            <>
              <MasonryGrid
                columnCount={1}
                className={cn("flex sm:hidden", refreshing && "opacity-55")}
                columns={columnsFor(1, buckets1)}
              />
              <MasonryGrid
                columnCount={2}
                className={cn(
                  "hidden sm:flex md:hidden",
                  refreshing && "opacity-55",
                )}
                columns={columnsFor(2, buckets2)}
              />
              <MasonryGrid
                columnCount={3}
                className={cn("hidden md:flex", refreshing && "opacity-55")}
                columns={columnsFor(3, buckets3)}
              />
            </>
          )}

          {/* Infinite-scroll sentinel — starts fetching ~800px before it appears. */}
          {!colorActive && hasMore && !showSkeleton ? (
            <div ref={sentinelRef} className="w-full py-4" aria-hidden>
              {loadingMore ? (
                layoutReady ? (
                  <MasonryGrid
                    columnCount={columnCount}
                    columns={Array.from({ length: columnCount }, (_, col) => [
                      <div
                        key={col}
                        className={cn(
                          "animate-pulse rounded-lg bg-[#ececee]",
                          col % 3 === 0
                            ? "h-64"
                            : col % 3 === 1
                              ? "h-52"
                              : "h-72",
                        )}
                      />,
                    ])}
                  />
                ) : (
                  <GridSkeletonColumns />
                )
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

/** First-paint shell while the homepage feed query is still streaming. */
export function ExploreFeedFallback() {
  return (
    <div className="flex w-full flex-1 flex-col bg-[#f7f7f7]">
      <div className="relative z-30 w-full shrink-0">
        <div className={FIGMA_TOOLBAR_SHEET}>
          <div className="h-[58px] sm:h-[62px]" />
        </div>
      </div>
      <div className="flex w-full items-start gap-2.5 border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] p-2 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff] sm:p-3.5">
        <GridSkeletonColumns />
      </div>
    </div>
  );
}

/** Loading placeholder — 1 col on mobile, 2 on sm, 3 on md+ (pure CSS). */
function GridSkeletonColumns() {
  const heights = ["h-64", "h-52", "h-80", "h-60", "h-72", "h-56"] as const;

  return (
    <div className="flex w-full items-start gap-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {heights.slice(0, 3).map((h, i) => (
          <div
            key={i}
            className={cn("animate-pulse rounded-lg bg-[#ececee]", h)}
          />
        ))}
      </div>
      <div className="hidden min-w-0 flex-1 flex-col gap-2.5 sm:flex">
        {heights.slice(2, 5).map((h, i) => (
          <div
            key={i}
            className={cn("animate-pulse rounded-lg bg-[#ececee]", h)}
          />
        ))}
      </div>
      <div className="hidden min-w-0 flex-1 flex-col gap-2.5 md:flex">
        {heights.slice(1, 4).map((h, i) => (
          <div
            key={i}
            className={cn("animate-pulse rounded-lg bg-[#ececee]", h)}
          />
        ))}
      </div>
    </div>
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
  "shadow-[0_0_0_1px_rgba(232,232,232,0.6),0_3px_9px_0_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04),0_14px_36px_-10px_rgba(0,0,0,0.12)]";

/** Paper node 8B-0 — Recently sort trigger */
const SORT_TRIGGER_SHADOW =
  "shadow-[0_0_0_0.5px_rgba(0,0,0,0.09),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04),0_0_0_1px_rgba(232,232,232,0.6),0_3px_9px_0_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)]";

/** Paper node 6X-0 — category scroll fade (38px) */
const CATEGORY_EDGE_FADE = "w-[38px] from-[#f7f7f7]";

function PillRail({
  categories,
  active,
  onSelect,
  onPrefetch,
  className,
}: {
  categories: Category[];
  active: string;
  onSelect: (slug: string) => void;
  onPrefetch?: (slug: string) => void;
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
    <div className={cn("relative min-w-0 self-stretch", className)}>
      <div
        ref={scrollRef}
        className="flex h-full items-center gap-2 overflow-x-auto px-2 py-3.5 [scrollbar-width:none] sm:gap-3 sm:px-0 sm:py-3.5 [&::-webkit-scrollbar]:hidden"
      >
        <Pill
          label="All"
          active={active === "all"}
          onClick={() => onSelect("all")}
          onPrefetch={() => onPrefetch?.("all")}
        />
        {categories.map((c) => (
          <Pill
            key={c.slug}
            label={c.name}
            active={active === c.slug}
            onClick={() => onSelect(c.slug)}
            onPrefetch={() => onPrefetch?.(c.slug)}
          />
        ))}
      </div>
      {/* Paper 6X-0 — edge fades when the rail scrolls */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 z-[1] bg-gradient-to-r to-transparent transition-opacity duration-200",
          CATEGORY_EDGE_FADE,
          edges.left ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-[1] bg-gradient-to-l to-transparent transition-opacity duration-200",
          CATEGORY_EDGE_FADE,
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
  onPrefetch,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onPrefetch?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onPrefetch}
      onFocus={onPrefetch}
      className={cn(
        "flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.5 py-2 text-sm tracking-tight shadow-[0_0_0_0.5px_rgba(0,0,0,0.09),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)] transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 sm:px-3.5 sm:py-2.5",
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
  onPrefetch,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
  onPrefetch?: (v: SortKey) => void;
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
        className={cn(
          "flex items-center justify-between overflow-hidden rounded-[22px] bg-[#f9f9fa] p-2.5 text-sm tracking-[-0.015em] text-[#1f2123]",
          SORT_MENU_WIDTH,
          SORT_TRIGGER_SHADOW,
        )}
      >
        <span className="whitespace-nowrap">{SORT_LABELS[value]}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-[#5c5c5e] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: "top right" }}
            className={cn(
              "absolute right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl bg-white p-1",
              SORT_MENU_WIDTH,
              POPOVER_SHADOW,
            )}
          >
            {SORT_ORDER.map((k) => {
              const active = value === k;
              return (
                <button
                  key={k}
                  type="button"
                  onPointerEnter={() => onPrefetch?.(k)}
                  onFocus={() => onPrefetch?.(k)}
                  onClick={() => {
                    onChange(k);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm tracking-[-0.015em] transition-colors hover:bg-[#f2f2f2]"
                >
                  <span
                    className={active ? "text-[#1f2123]" : "text-[#707275]"}
                  >
                    {SORT_LABELS[k]}
                  </span>
                  {active ? (
                    <Check
                      className="size-4 shrink-0 text-[#1f2123]"
                      strokeWidth={2}
                    />
                  ) : (
                    <span className="size-4 shrink-0" aria-hidden />
                  )}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

function GitHubStarLink() {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Star on GitHub"
        className={cn(
          "flex size-[38px] items-center justify-center overflow-hidden rounded-xl bg-white text-[#1f2123] transition-transform active:scale-[0.98] motion-reduce:active:scale-100",
          TAG_SEGMENT_SHADOW,
        )}
      >
        <GitHubIcon className="size-[18px]" />
      </a>

      <AnimatePresence>
        {hovered ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: "top right" }}
            className="pointer-events-none absolute right-0 top-full z-50 mt-2 whitespace-nowrap rounded-lg bg-[#1f2123] px-2.5 py-1.5 text-xs font-medium text-white shadow-[0_6px_20px_-6px_rgba(0,0,0,0.35)]"
          >
            Star on GitHub
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

/**
 * SSR/hydration placeholder — same geometry as MasonryCard, no layoutId / video.
 * Positions match the interactive grid so hydration never reshuffles posts.
 */
function StaticFeedCard({
  post,
  index,
}: {
  post: PostListItem;
  index: number;
}) {
  const aspectRatio =
    post.thumbnail?.width && post.thumbnail?.height
      ? `${post.thumbnail.width} / ${post.thumbnail.height}`
      : index % 3 === 0
        ? "720 / 900"
        : index % 3 === 1
          ? "1"
          : "1066 / 720";

  const src = post.thumbnail?.url;
  const alt =
    (post.caption ? cleanCaptionForDisplay(post.caption) : null) ||
    post.title ||
    "";

  return (
    <div className="relative block overflow-hidden rounded-lg border border-[#e3e5e8] bg-[#ededef]">
      <div className="relative w-full" style={{ aspectRatio }}>
        {src ? (
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
            className="object-cover"
            priority={index < 4}
            unoptimized
          />
        ) : null}
      </div>
    </div>
  );
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
  suspended: boolean;
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
  const media = post.images?.length
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

  const {
    ref: viewportRef,
    near,
    inView,
  } = useViewportPresence(Boolean(videoItem));

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
    playMediaSwitch();
  };

  const activeSrc =
    mediaIdx === 0
      ? (post.thumbnail?.url ?? media[0]?.url)
      : media[mediaIdx]?.url;

  return (
    <motion.div
      ref={viewportRef}
      layout={false}
      layoutId={`post-${post.id}`}
      transition={instantLayout ? { duration: 0 } : undefined}
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
        "group relative block cursor-pointer overflow-hidden rounded-lg border border-[#e3e5e8] bg-[#ededef]",
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
                alt={
                  (post.caption
                    ? cleanCaptionForDisplay(post.caption)
                    : null) ||
                  post.title ||
                  ""
                }
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover"
                priority={index < 4 && mediaIdx === 0}
                unoptimized
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
            play={((post.autoplayInFeed && inView) || hovered) && !suspended}
            postId={post.id}
            getVideoTime={getVideoTime}
            setVideoTime={setVideoTime}
          />
        ) : null}
      </div>

      {/* top-left: open affordance (hover) — Paper node CL-0 */}
      <span
        className={cn(
          "pointer-events-none absolute left-2.5 top-2.5 flex items-center rounded-[99px] p-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100",
          NAV_OPEN_AFFORDANCE_CLASS,
        )}
      >
        <ArrowUpRight className="size-[18px] text-white" strokeWidth={1.8} />
      </span>

      {/* top-right: hover media navigator for multi-image / video galleries */}
      {isGallery ? (
        <FeedMediaNav
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
            unoptimized
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

function EmptyState({
  hasPosts,
  colorSearch,
}: {
  hasPosts: boolean;
  colorSearch?: boolean;
}) {
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center bg-[#f7f7f7] py-16 text-center">
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
