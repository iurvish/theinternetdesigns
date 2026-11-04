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
import { ArrowUpRight, Check, ChevronDown, Menu, Search, X } from "lucide-react";
import type {
  PostListItem,
  FeedOrder,
  FeedSurface,
  FeedView,
} from "./queries";
import { cn } from "@/lib/utils";
import { PostOverlay } from "./post-overlay";
import { FeedMediaNav } from "./media-nav-pill";
import { GlassSurface } from "./glass";
import { searchByColorsAction } from "./color-search-action";
import { loadFeedPageAction } from "./feed-actions";
import { runSearchAction } from "./search-actions";
import { SearchPalette } from "./search-command";
import { WebsiteCard } from "./website-card";
import { WebsitePreview } from "./website-preview";
import {
  SIDEBAR_WIDTH,
  SidebarCloseButton,
  SidebarContent,
  SidebarDrawer,
  SidebarRail,
} from "@/components/layout/app-sidebar";
import { searchKey, type ActiveSearch } from "./search-filter";
import { SetupRequired } from "@/components/setup-required";
import { SITE_NAME } from "@/lib/site-config";
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

type FeedPageCache = { posts: PostListItem[]; hasMore: boolean };

/** Survives ExploreFeed remounts within the same JS realm (soft navigations). */
const feedPageCache = new Map<string, FeedPageCache>();
const feedInflight = new Map<string, Promise<FeedPageCache>>();

/**
 * Committed search and colour results, keyed the same way the stale-response
 * guards key them. Both actions are in-memory lookups on the server now, so
 * what's left to remove is the round trip — going back to a search you already
 * ran repaints the grid with no request.
 */
const searchResultCache = new Map<
  string,
  { posts: PostListItem[]; chips: string[] }
>();
const colorResultCache = new Map<string, PostListItem[]>();
const DEFAULT_FILTER_KEY = "designs|all|all|recent";
const EMPTY_POSTS: PostListItem[] = [];

const FEED_PAGE_SIZE = 24;

function asPostList(value: unknown): PostListItem[] {
  return Array.isArray(value) ? (value as PostListItem[]) : EMPTY_POSTS;
}

function filterCacheKey(
  surface: FeedSurface,
  category: string,
  view: FeedView,
  order: FeedOrder,
): string {
  return `${surface}|${category}|${view}|${order}`;
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
  surface: FeedSurface,
  category: string,
  view: FeedView,
  order: FeedOrder,
): Promise<FeedPageCache> {
  const key = filterCacheKey(surface, category, view, order);
  const cached = feedPageCache.get(key);
  if (cached && asPostList(cached.posts).length > 0) {
    return Promise.resolve(cached);
  }
  const pending = feedInflight.get(key);
  if (pending) return pending;

  const request = loadFeedPageAction({ offset: 0, surface, category, view, order })
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

/**
 * The menu still reads as one list, but underneath it drives two axes:
 * "Featured" and "Hidden gems" are subsets of the recent order, not orderings,
 * so they set a view while "Recently" / "Oldest" set a direction. Keeping them
 * separate in the query is what lets a view be ordered at all.
 */
type SortKey = "recent" | "hidden_gems" | "featured" | "oldest";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently",
  hidden_gems: "Hidden Gems",
  featured: "Featured",
  oldest: "Oldest",
};

const SORT_OPTIONS: SortKey[] = ["recent", "hidden_gems", "featured", "oldest"];

function splitSort(key: SortKey): { view: FeedView; order: FeedOrder } {
  if (key === "oldest") return { view: "all", order: "oldest" };
  if (key === "featured") return { view: "featured", order: "recent" };
  if (key === "hidden_gems") return { view: "hidden_gems", order: "recent" };
  return { view: "all", order: "recent" };
}

function joinSort(view: FeedView, order: FeedOrder): SortKey {
  if (view === "featured") return "featured";
  if (view === "hidden_gems") return "hidden_gems";
  return order === "oldest" ? "oldest" : "recent";
}

const SORT_MENU_WIDTH = "w-[8.75rem]";

/** Raised Paper stack — the chips carry it. */
const CHIP_SHADOW =
  "shadow-[0_0_0_0.5px_rgba(0,0,0,0.09),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)]";

/** Paper node 8B-0 — the "Recently" sort trigger. */
const SORT_TRIGGER_SHADOW =
  "shadow-[0_0_0_0.5px_rgba(0,0,0,0.09),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04),0_0_0_1px_rgba(232,232,232,0.6),0_3px_9px_0_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)]";

/** Neutral, never brand-coloured, never removed. */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/35";

/**
 * The public "The Internet Designs" explorer — a sidebar shell (brand, search,
 * views, colour), a category chip rail across the top of the content column,
 * and a row-first masonry feed (newest across the top).
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
  const [surface, setSurface] = useState<FeedSurface>("designs");
  const [active, setActive] = useState<string>("all");
  // Two axes, not one: `view` picks the set (sidebar), `order` picks the
  // direction (top bar). They compose, so "Featured · Oldest" is reachable.
  const [view, setView] = useState<FeedView>("all");
  const [order, setOrder] = useState<FeedOrder>("recent");
  const [menuOpen, setMenuOpen] = useState(false);
  // Selected search colours — when non-empty the grid below is replaced (in place,
  // no navigation) with colour-matched results.
  const [colors, setColors] = useState<string[]>([]);
  // Committed palette search. Colour and keyword search both replace the grid,
  // so they're mutually exclusive — two "the feed isn't the feed" modes at once
  // would leave no way to tell which one you're looking at.
  const [search, setSearch] = useState<ActiveSearch | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const safeInitialPosts = asPostList(initialPosts);

  const applySearch = useCallback((next: ActiveSearch) => {
    setSearch(next);
    setColors([]);
  }, []);

  const applyColors = useCallback((next: string[]) => {
    setColors(next);
    if (next.length > 0) setSearch(null);
  }, []);

  // Picking a category is a way back to the normal feed, so it drops both
  // replace-the-grid filters rather than silently doing nothing behind them.
  const selectCategory = useCallback((slug: string) => {
    setActive(slug);
    setSearch(null);
    setColors([]);
  }, []);

  const selectSurface = useCallback(
    (nextSurface: FeedSurface, slug: string) => {
      setSurface(nextSurface);
      setActive(slug);
      setSearch(null);
      setColors([]);
    },
    [],
  );

  const sortKey = joinSort(view, order);
  const selectSort = useCallback((next: SortKey) => {
    const { view: nextView, order: nextOrder } = splitSort(next);
    setView(nextView);
    setOrder(nextOrder);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !isTyping(e.target);
      if (!cmdK && !slash) return;
      // The lightbox and the site preview own the keyboard while they're up.
      if (
        document.querySelector("[data-post-overlay],[data-website-preview]")
      ) {
        return;
      }
      e.preventDefault();
      setPaletteOpen((open) => (cmdK ? !open : true));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const prefetchCategory = useCallback(
    (slug: string) => {
      void prefetchFeedPage(surface, slug, view, order);
    },
    [surface, view, order],
  );

  // Warm every category for the current view/order after idle so first clicks
  // are cache hits.
  useEffect(() => {
    const slugs =
      surface === "websites" ? ["all"] : ["all", ...categories.map((c) => c.slug)];
    let cancelled = false;
    let cursor = 0;
    let timeout = 0;

    const tick = () => {
      if (cancelled) return;
      const batch: string[] = [];
      while (cursor < slugs.length && batch.length < 3) {
        const slug = slugs[cursor++]!;
        if (cachedPostsForKey(filterCacheKey(surface, slug, view, order))) {
          continue;
        }
        batch.push(slug);
      }
      if (batch.length === 0) return;
      void Promise.all(
        batch.map((slug) => prefetchFeedPage(surface, slug, view, order)),
      ).then(
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
  }, [categories, surface, view, order, active]);

  const sidebarProps = {
    activeSurface: surface,
    activeCategory: active,
    onSelect: selectSurface,
    search,
    onClearSearch: () => setSearch(null),
    colors,
    onColors: applyColors,
  };

  const controls = (
    <SortMenu
      value={sortKey}
      onChange={selectSort}
      onPrefetch={(next) => {
        const { view: v, order: o } = splitSort(next);
        void prefetchFeedPage(surface, active, v, o);
      }}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh w-full bg-canvas">
        <SidebarRail>
          <SidebarContent
            {...sidebarProps}
            onOpenSearch={() => setPaletteOpen(true)}
          />
        </SidebarRail>

        <SidebarDrawer open={menuOpen} onClose={() => setMenuOpen(false)}>
          <SidebarContent
            {...sidebarProps}
            sheet
            markerId="sidebar-nav-marker-drawer"
            onOpenSearch={() => {
              setMenuOpen(false);
              setPaletteOpen(true);
            }}
            onNavigate={() => setMenuOpen(false)}
            headerTrailing={
              <SidebarCloseButton onClick={() => setMenuOpen(false)} />
            }
          />
        </SidebarDrawer>

        {/* `min-w-0` or the chip rail's scroll container inherits the grid's
            intrinsic width and pushes the column past the viewport. */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile chrome — the rail is hidden below `lg`, so the brand and
              the menu affordance have to live here instead. */}
          <div className="flex h-14 shrink-0 items-center gap-2.5 px-3.5 lg:hidden">
            <Image
              src="/favicon-96x96.png"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-md object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
              priority
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight text-ink">
              {SITE_NAME}
            </span>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className={cn(
                "-mr-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-2",
                "transition-[background-color,color,transform] duration-150 ease-out",
                "hover:bg-chip hover:text-ink active:scale-[0.96] motion-reduce:active:scale-100",
                FOCUS_RING,
              )}
            >
              <Menu className="size-[1.25rem]" strokeWidth={1.8} />
            </button>
          </div>

          {/* Chip rail. Sticky so the categories stay reachable down a long
              feed — opaque, because a translucent bar let card edges ghost
              through it on scroll. */}
          <div className="sticky top-0 z-30 shrink-0 bg-canvas">
            <div className="flex items-center gap-3 px-2.5 pb-3 pt-3 sm:gap-5 sm:px-3.5 sm:pb-3.5 sm:pt-5">
              {/* Categories describe designs. A website entry is a URL, not a
                  tagged image, so the rail would filter nothing. */}
              {surface === "designs" ? (
                <PillRail
                  categories={categories}
                  active={active}
                  onSelect={selectCategory}
                  onPrefetch={prefetchCategory}
                  className="min-w-0 flex-1"
                />
              ) : (
                <div className="min-w-0 flex-1" />
              )}
              <div className="flex shrink-0 items-center gap-2">{controls}</div>
            </div>
          </div>

          <div className="flex min-h-0 w-full flex-1 flex-col">
            <FeedBody
              initialPosts={safeInitialPosts}
              error={error}
              surface={surface}
              active={active}
              view={view}
              order={order}
              colors={colors}
              search={search}
              onClearSearch={() => setSearch(null)}
              onEditSearch={() => setPaletteOpen(true)}
            />
          </div>
        </div>

        <SearchPalette
          open={paletteOpen}
          active={search}
          onClose={() => setPaletteOpen(false)}
          onSelect={applySearch}
        />
      </div>
    </MotionConfig>
  );
}

/** Keyboard shortcuts shouldn't fire while someone is typing somewhere else. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
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
        "flex w-full gap-2.5 bg-canvas px-2.5 pb-2.5 pt-2 sm:px-3.5 sm:pb-3.5 sm:pt-3",
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
  surface,
  active,
  view,
  order,
  colors,
  search,
  onClearSearch,
  onEditSearch,
}: {
  initialPosts: PostListItem[];
  error: string | null;
  surface: FeedSurface;
  active: string;
  view: FeedView;
  order: FeedOrder;
  colors: string[];
  search: ActiveSearch | null;
  onClearSearch: () => void;
  onEditSearch: () => void;
}) {
  // Guard against undefined during HMR / stale call sites after the
  // postsPromise → initialPosts rename.
  const initialPosts = asPostList(initialPostsProp);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // Site entries open a framed preview instead of the media lightbox.
  const [previewPost, setPreviewPost] = useState<PostListItem | null>(null);

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
    if (surface !== "designs" || active !== "all") return;
    if (view !== "all" || order !== "recent") return;

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
  }, [initialPosts, surface, active, view, order]);

  // Colour-matched results fetched in place. Stored tagged with the colour key so
  // we can tell fresh results from a previous search's (avoids showing stale posts
  // during a re-fetch) and only ever setState inside the async callback.
  const colorKey = colors.join(",");
  const [colorResult, setColorResult] = useState<{
    key: string;
    posts: PostListItem[];
  } | null>(null);

  // A cached key is read during render rather than pushed through state, so
  // revisiting a colour repaints in the same frame without a render cascade.
  const cachedColorPosts = colorResultCache.get(colorKey) ?? null;

  useEffect(() => {
    if (colors.length === 0) return;
    const key = colorKey;
    if (colorResultCache.has(key)) return;
    let cancelled = false;
    searchByColorsAction(colors).then((res) => {
      colorResultCache.set(key, res);
      if (!cancelled) setColorResult({ key, posts: res });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorKey]);

  // Keyword / tag results, tagged with the filter key for the same reason as
  // colours above: a stale response must never paint over a newer search.
  const activeSearchKey = searchKey(search);
  const [searchResult, setSearchResult] = useState<{
    key: string;
    posts: PostListItem[];
    chips: string[];
  } | null>(null);

  const cachedSearch = searchResultCache.get(activeSearchKey) ?? null;

  useEffect(() => {
    if (!search) return;
    const key = activeSearchKey;
    if (searchResultCache.has(key)) return;
    let cancelled = false;
    runSearchAction(search).then((res) => {
      searchResultCache.set(key, { posts: res.posts, chips: res.chips });
      if (!cancelled) {
        setSearchResult({ key, posts: res.posts, chips: res.chips });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSearchKey]);

  // Swap the grid when category/view/order change. Cached pages paint instantly;
  // uncached first visits show a skeleton instead of the previous category.
  useEffect(() => {
    const key = filterCacheKey(surface, active, view, order);
    if (loadedFilterKey.current === key) return;

    const cachedPosts = cachedPostsForKey(key);
    if (cachedPosts) {
      loadedFilterKey.current = key;
      setFeedPosts(cachedPosts);
      setHasMore(Boolean(feedPageCache.get(key)?.hasMore));
      setFeedBootstrapping(false);
      const gen = ++loadGen.current;
      let cancelled = false;
      prefetchFeedPage(surface, active, view, order).then(
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
    prefetchFeedPage(surface, active, view, order).then(
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
  }, [surface, active, view, order]);

  const loadMore = useCallback(async () => {
    if (
      loadingMoreRef.current ||
      !hasMore ||
      colors.length > 0 ||
      search !== null ||
      feedBootstrapping
    )
      return;
    const gen = loadGen.current;
    const filterKey = filterCacheKey(surface, active, view, order);
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = asPostList(
        await loadFeedPageAction({
          offset: feedPosts.length,
          surface,
          category: active,
          view,
          order,
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
    search,
    feedBootstrapping,
    feedPosts.length,
    surface,
    active,
    view,
    order,
  ]);

  // Prefetch the next page when the sentinel is ~800px from view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || colors.length > 0 || search !== null) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, colors.length, search, feedPosts.length, hasMore]);

  const colorActive = colors.length > 0;
  const colorReady =
    colorActive && (cachedColorPosts !== null || colorResult?.key === colorKey);
  const colorLoading = colorActive && !colorReady;
  const colorPosts = colorReady
    ? (cachedColorPosts ?? colorResult!.posts)
    : null;

  const searchActive = search !== null;
  const searchReady =
    searchActive && (cachedSearch !== null || searchResult?.key === activeSearchKey);
  const searchLoading = searchActive && !searchReady;
  const searchPosts = searchReady
    ? (cachedSearch?.posts ?? searchResult!.posts)
    : null;

  const refreshing = colorLoading || searchLoading || feedBootstrapping;
  // Both replace-the-grid modes page their whole result set in one request.
  const paging = !colorActive && !searchActive;

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
    if (searchActive) return asPostList(searchPosts ?? feedPosts);
    if (colorActive) return asPostList(colorPosts ?? feedPosts);
    return asPostList(feedPosts);
  }, [searchActive, searchPosts, colorActive, colorPosts, feedPosts]);

  const layoutReady = useMasonryReady();
  // Websites get three columns at most: the tile is a scaled desktop page, and
  // a fourth column shrinks it to the point where the site is unreadable.
  const maxColumns = surface === "websites" ? 3 : 4;
  const columnCount = Math.min(useMasonryLayout(), maxColumns);
  const aspectRatios = useMemo(
    () => visible.map((p, i) => postAspectRatioValue(p, i)),
    [visible],
  );
  const {
    one: buckets1,
    two: buckets2,
    three: buckets3,
    four: buckets4,
  } = useResponsiveMasonryBuckets(aspectRatios);

  const mapBuckets = (buckets: number[][], mode: "static" | "interactive") =>
    buckets.map((indices) =>
      indices.map((i) => {
        const p = visible[i]!;
        // Same component in both modes — the markup has to be identical across
        // SSR and hydration or the card changes size under the reader.
        if (p.siteUrl) {
          const siteUrl = p.siteUrl;
          return (
            <WebsiteCard
              key={p.id}
              post={p}
              siteUrl={siteUrl}
              onOpen={
                mode === "interactive" ? () => setPreviewPost(p) : () => {}
              }
            />
          );
        }
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

  const columnsFor = (cols: number, buckets: number[][]) => {
    // After hydration, drop inactive breakpoint trees so images/layoutIds
    // only exist once. SSR keeps all four so CSS can show the right one.
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
          {search ? (
            <ResultsBar
              search={search}
              count={searchReady ? visible.length : null}
              chips={
                searchReady
                  ? (cachedSearch?.chips ?? searchResult?.chips ?? [])
                  : []
              }
              onClear={onClearSearch}
              onEdit={onEditSearch}
            />
          ) : null}
          {showSkeleton ? (
            <GridSkeletonColumns />
          ) : isEmpty ? (
            <EmptyState
              hasPosts={initialPosts.length > 0}
              colorSearch={colorActive}
              searchLabel={search?.label ?? null}
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
                className={cn(
                  "hidden md:flex",
                  // Only hand off to a fourth column when there is one.
                  maxColumns >= 4 && "xl:hidden",
                  refreshing && "opacity-55",
                )}
                columns={columnsFor(3, buckets3)}
              />
              {maxColumns >= 4 ? (
                <MasonryGrid
                  columnCount={4}
                  className={cn("hidden xl:flex", refreshing && "opacity-55")}
                  columns={columnsFor(4, buckets4)}
                />
              ) : null}
            </>
          )}

          {/* Infinite-scroll sentinel — starts fetching ~800px before it appears. */}
          {paging && hasMore && !showSkeleton ? (
            <div ref={sentinelRef} className="w-full py-4" aria-hidden>
              {loadingMore ? (
                layoutReady ? (
                  <MasonryGrid
                    columnCount={columnCount}
                    columns={Array.from({ length: columnCount }, (_, col) => [
                      <div
                        key={col}
                        className={cn(
                          "animate-pulse rounded-lg bg-skel",
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

      <WebsitePreview
        post={previewPost}
        siteUrl={previewPost?.siteUrl ?? null}
        open={previewPost !== null}
        onClose={() => setPreviewPost(null)}
      />

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
    <div className="flex min-h-dvh w-full bg-canvas">
      {/* Reserve the rail so the grid doesn't reflow sideways when the real
          shell arrives — same width, same border, no content. */}
      <div
        style={{ width: SIDEBAR_WIDTH }}
        // Same fading seam as the real rail, or the skeleton flashes a hard
        // full-height rule for one frame before the shell takes over.
        className="hidden shrink-0 bg-shell bg-[linear-gradient(to_bottom,var(--color-shell)_0%,var(--color-line)_28%,var(--color-line)_72%,var(--color-shell)_100%)] bg-[length:1px_100%] bg-right bg-no-repeat lg:block"
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-14 shrink-0 lg:hidden" />
        <div className="h-[4.25rem] shrink-0" />
        <div className="flex w-full items-start gap-2.5 bg-canvas px-2.5 pb-2.5 sm:px-3.5 sm:pb-3.5">
          <GridSkeletonColumns />
        </div>
      </div>
    </div>
  );
}

/** Loading placeholder — 1 col on mobile, 2 on sm, 3 on md, 4 on xl (pure CSS). */
function GridSkeletonColumns() {
  const heights = ["h-64", "h-52", "h-80", "h-60", "h-72", "h-56"] as const;
  // Offsets differ per column so the placeholder reads as masonry rather than
  // four identical stacks.
  const columns = [
    { from: 0, show: "flex" },
    { from: 2, show: "hidden sm:flex" },
    { from: 1, show: "hidden md:flex" },
    { from: 3, show: "hidden xl:flex" },
  ] as const;

  return (
    <div className="flex w-full items-start gap-2.5">
      {columns.map(({ from, show }, col) => (
        <div key={col} className={cn("min-w-0 flex-1 flex-col gap-2.5", show)}>
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className={cn(
                "animate-pulse rounded-lg bg-skel",
                heights[(from + row) % heights.length],
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const POPOVER_SHADOW =
  "shadow-[0_0_0_1px_rgba(232,232,232,0.6),0_3px_9px_0_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04),0_14px_36px_-10px_rgba(0,0,0,0.12)]";

/** Scroll fade on the chip rail — matches the canvas it sits on. */
const CATEGORY_EDGE_FADE = "w-10 from-canvas";

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
    <div className={cn("relative min-w-0", className)}>
      {/* One line, always. Tight padding and a 0.5rem gap are what let all
          twelve fit without scrolling on a normal desktop; past that it
          scrolls under the edge fades rather than wrapping.

          `overflow-x: auto` computes the cross axis to `auto` as well — there
          is no way to scroll one axis and leave the other visible — so the
          scroller was clipping the chips' drop shadows flat against its top
          and bottom edges. The padding gives the shadow room inside the clip
          box and the matching negative margin keeps the row's outer size and
          the chips' position unchanged. */}
      <div
        ref={scrollRef}
        className="-mx-1.5 -my-2 flex items-center gap-2 overflow-x-auto px-1.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
          "pointer-events-none absolute -inset-y-2 -left-1.5 z-[1] bg-gradient-to-r to-transparent transition-opacity duration-200",
          CATEGORY_EDGE_FADE,
          edges.left ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute -inset-y-2 -right-1.5 z-[1] bg-gradient-to-l to-transparent transition-opacity duration-200",
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
      aria-pressed={active}
      className={cn(
        "flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-medium tracking-tight",
        CHIP_SHADOW,
        // Weight is constant; only the fill and the ink move.
        "transition-[background-color,color,transform] duration-150 ease-out",
        "active:scale-[0.96] motion-reduce:active:scale-100",
        FOCUS_RING,
        active
          ? "bg-chip-on text-chip-on-fg"
          // ink-2, not ink-3: on a chip this light the old #707275 came in at
          // 4.31:1, under AA. Lightness is the only channel that moved.
          : "bg-chip text-ink-2 hover:bg-chip-hover hover:text-ink",
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
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort: ${SORT_LABELS[value]}`}
        className={cn(
          "flex h-9 items-center justify-between overflow-hidden rounded-[1.375rem] bg-shell px-3 text-[0.8125rem] font-medium tracking-tight text-ink",
          SORT_MENU_WIDTH,
          SORT_TRIGGER_SHADOW,
          "transition-[background-color,transform] duration-150 ease-out",
          "hover:bg-panel active:scale-[0.96] motion-reduce:active:scale-100",
          FOCUS_RING,
        )}
      >
        <span className="whitespace-nowrap">{SORT_LABELS[value]}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-ink-2 transition-transform duration-150 ease-out",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: "top right" }}
            className={cn(
              "absolute right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl bg-panel p-1",
              SORT_MENU_WIDTH,
              POPOVER_SHADOW,
            )}
          >
            {SORT_OPTIONS.map((k) => {
              const selected = value === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onPointerEnter={() => onPrefetch?.(k)}
                  onFocus={() => onPrefetch?.(k)}
                  onClick={() => {
                    onChange(k);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-[0.8125rem] font-medium tracking-tight",
                    "transition-colors duration-150 ease-out hover:bg-chip",
                    FOCUS_RING,
                    selected ? "text-ink" : "text-ink-2",
                  )}
                >
                  <span>{SORT_LABELS[k]}</span>
                  {selected ? (
                    <Check className="size-4 shrink-0 text-ink" strokeWidth={2} />
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
    <div className="relative block overflow-hidden rounded-lg border border-line bg-skel">
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
        "group relative block cursor-pointer overflow-hidden rounded-lg border border-line bg-skel",
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

      {/* top-left: source post — opens the original on X / the web */}
      {post.sourceUrl ? (
        <a
          href={post.sourceUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Open original post"
          onClick={(e) => e.stopPropagation()}
          className="absolute left-2.5 top-2.5 z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          <GlassSurface
            width={30}
            height={30}
            radius={99}
            className="flex size-[30px] items-center justify-center"
          >
            <span className="flex size-full items-center justify-center">
              <ArrowUpRight className="size-[18px] text-white" strokeWidth={1.8} />
            </span>
          </GlassSurface>
        </a>
      ) : null}

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
 * Feed video — muted, looping, no controls. Plays when `play` is true (the
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
  searchLabel,
}: {
  hasPosts: boolean;
  colorSearch?: boolean;
  searchLabel?: string | null;
}) {
  const title = searchLabel
    ? `No designs for \u201c${searchLabel}\u201d`
    : colorSearch
      ? "No designs match those colours"
      : hasPosts
        ? "Nothing in this category yet"
        : "No inspiration yet";
  const detail = searchLabel
    ? "Try a broader word, or pick a category from the search panel."
    : colorSearch
      ? "Try picking a different or lighter shade."
      : hasPosts
        ? "Try a different filter to see more designs."
        : "New posts will show up here.";

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center bg-canvas py-16 text-center">
      <h2 className="text-base font-medium text-ink text-balance">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-ink-2 text-balance">{detail}</p>
    </div>
  );
}

/**
 * Says what the feed is showing and how to leave. The toolbar chip can scroll
 * out of view once you are deep in results, so the answer to "why am I not
 * seeing everything?" is repeated at the top of the grid itself.
 */
function ResultsBar({
  search,
  count,
  chips,
  onClear,
  onEdit,
}: {
  search: ActiveSearch;
  count: number | null;
  chips: string[];
  onClear: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-panel px-3 py-2.5 shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 items-center gap-2 text-left"
        aria-label={`Change search: ${search.label}`}
      >
        <Search
          className="size-4 shrink-0 text-ink-4"
          strokeWidth={1.8}
          aria-hidden
        />
        <span className="truncate text-sm font-medium tracking-tight text-ink">
          {search.label}
        </span>
      </button>

      <span className="shrink-0 text-sm tabular-nums text-ink-2">
        {count === null
          ? "searching\u2026"
          : `${count} ${count === 1 ? "design" : "designs"}`}
      </span>

      {chips.length > 0 ? (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-medium tracking-tight text-ink-2"
            >
              {chip}
            </span>
          ))}
        </span>
      ) : null}

      <button
        type="button"
        onClick={onClear}
        className={cn(
          "ml-auto flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium tracking-tight text-ink-2",
          "transition-colors duration-150 ease-out hover:bg-chip hover:text-ink",
          FOCUS_RING,
        )}
      >
        Clear
        <X className="size-3.5" strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}
