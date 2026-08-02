"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ArrowUpRight, ChevronDown, Play } from "lucide-react";
import type { PostListItem } from "./queries";
import { cn } from "@/lib/utils";
import { PostOverlay } from "./post-overlay";
import { ColorSearch } from "./color-search";
import { SetupRequired } from "@/components/setup-required";

export type PostsResult = { posts: PostListItem[]; error: string | null };

type Category = { slug: string; name: string };
type SortKey = "recent" | "oldest";

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

  return (
    <MotionConfig reducedMotion="user">
      {/* Filter toolbar — rendered immediately (outside the grid's Suspense) so it
          never blanks out on refresh. Elevated (relative z-30) so its dropdowns
          paint above the grid; drop shadow gives the bar its crisp float. */}
      <div className="relative z-30 flex w-full flex-col items-start border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff,0_8px_20px_-12px_rgba(0,0,0,0.12)]">
        <div className="flex w-full items-center gap-4 px-3.5">
          <div className="flex shrink-0 items-center py-3.5">
            <ColorSearch />
          </div>

          <Divider />

          <PillRail categories={categories} active={active} onSelect={setActive} />

          <Divider />

          <div className="flex shrink-0 items-center py-3.5">
            <SortMenu value={sort} onChange={setSort} />
          </div>
        </div>
      </div>

      {/* Only the grid streams in — the bar above stays put */}
      <Suspense fallback={<GridSkeleton />}>
        <FeedBody postsPromise={postsPromise} active={active} sort={sort} />
      </Suspense>

      {/* Footer strip */}
      <div className="h-16 w-full shrink-0 border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]" />
    </MotionConfig>
  );
}

function GridBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-1 items-start gap-2.5 border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] p-3.5 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]">
      {children}
    </div>
  );
}

function FeedBody({
  postsPromise,
  active,
  sort,
}: {
  postsPromise: Promise<PostsResult>;
  active: string;
  sort: SortKey;
}) {
  const { posts, error } = use(postsPromise);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const visible = useMemo(() => {
    const filtered =
      active === "all"
        ? posts
        : posts.filter((p) => p.categories.some((c) => c.slug === active));
    return [...filtered].sort((a, b) => {
      const at = a.publishedAt ? a.publishedAt.getTime() : 0;
      const bt = b.publishedAt ? b.publishedAt.getTime() : 0;
      return sort === "recent" ? bt - at : at - bt;
    });
  }, [posts, active, sort]);

  if (error) {
    return (
      <GridBox>
        <SetupRequired detail={error} />
      </GridBox>
    );
  }

  return (
    <>
      <GridBox>
        {visible.length === 0 ? (
          <EmptyState hasPosts={posts.length > 0} />
        ) : (
          <div className="w-full columns-2 gap-2.5 md:columns-3 [column-fill:_balance]">
            {visible.map((p, i) => (
              <MasonryCard key={p.id} post={p} index={i} onOpen={setOpenIndex} />
            ))}
          </div>
        )}
      </GridBox>

      <AnimatePresence>
        {openIndex !== null ? (
          <PostOverlay
            key="post-overlay"
            posts={visible}
            index={openIndex}
            onIndexChange={setOpenIndex}
            onClose={() => setOpenIndex(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function GridSkeleton() {
  return (
    <GridBox>
      <div className="w-full columns-2 gap-2.5 md:columns-3">
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

function Divider() {
  // Full-height hairline with a 1px white bevel to its right (Figma node 12:162).
  return (
    <div
      className="w-px shrink-0 self-stretch bg-[#e3e5e8] shadow-[1px_0_0_0_rgba(255,255,255,0.9)]"
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
}: {
  categories: Category[];
  active: string;
  onSelect: (slug: string) => void;
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
    <div className="relative min-w-0 flex-1">
      <div
        ref={scrollRef}
        className="flex items-center gap-3 overflow-x-auto py-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Pill label="All" active={active === "all"} onClick={() => onSelect("all")} />
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
        "flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.5 py-2.5 text-sm tracking-tight shadow-[0_0_0_0.5px_rgba(0,0,0,0.09),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)] transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100",
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
        className="flex w-30 items-center justify-between overflow-hidden rounded-3xl bg-[#f9f9fa] p-2.5 text-sm tracking-tight text-[#1f2123] shadow-[0_0_0_1px_rgba(232,232,232,0.6),0_3px_9px_0_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)]"
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
              "absolute right-0 top-full z-50 mt-1.5 w-30 overflow-hidden rounded-xl bg-white p-1",
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

/** Small skeuomorphic layout-preview widget from the toolbar (node 1:22). */
function MasonryCard({
  post,
  index,
  onOpen,
}: {
  post: PostListItem;
  index: number;
  onOpen: (i: number) => void;
}) {
  const aspectRatio =
    post.thumbnail?.width && post.thumbnail?.height
      ? `${post.thumbnail.width} / ${post.thumbnail.height}`
      : index % 3 === 0
        ? "720 / 900"
        : index % 3 === 1
          ? "1"
          : "1066 / 720";

  return (
    <motion.div
      layoutId={`post-${post.id}`}
      transition={{ type: "spring", duration: 0.3, bounce: 0.08 }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(index)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(index);
        }
      }}
      className="group relative mb-2.5 block cursor-pointer break-inside-avoid overflow-hidden rounded-lg border border-[#e3e5e8] bg-[#ededef]"
    >
      <div className="relative w-full" style={{ aspectRatio }}>
        {post.thumbnail?.url ? (
          <Image
            src={post.thumbnail.url}
            alt={post.caption ?? post.title ?? ""}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover"
          />
        ) : null}
      </div>

      {/* top-left: open affordance (hover) */}
      <span className="pointer-events-none absolute left-2.5 top-2.5 flex items-center rounded-full bg-[#c4c4c5]/60 p-1.5 opacity-0 shadow-[inset_0_0_53px_1px_rgba(255,255,255,0.25)] backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
        <ArrowUpRight className="size-4.5 text-white" strokeWidth={2.2} />
      </span>

      {/* top-right: image count / video badge */}
      {post.hasVideo ? (
        <span className="pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1 rounded-3xl bg-[#c4c4c5]/65 px-3 py-1.5 text-sm font-medium text-white shadow-[inset_0_0_53px_1px_rgba(255,255,255,0.25)] backdrop-blur-[2px]">
          <Play className="size-3.5 fill-white" />
        </span>
      ) : post.imageCount > 1 ? (
        <span className="pointer-events-none absolute right-2.5 top-2.5 flex items-center justify-center rounded-3xl bg-[#c4c4c5]/65 px-3 py-2 text-sm font-medium leading-none text-white shadow-[inset_0_0_53px_1px_rgba(255,255,255,0.25)] backdrop-blur-[2px]">
          {post.imageCount}
        </span>
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

function EmptyState({ hasPosts }: { hasPosts: boolean }) {
  return (
    <div className="flex w-full flex-col items-center justify-center py-24 text-center">
      <h2 className="text-base font-medium text-[#1f2123]">
        {hasPosts ? "Nothing in this category yet" : "No inspiration yet"}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-[#707275]">
        {hasPosts
          ? "Try a different filter to see more designs."
          : "Add posts from the admin panel to start populating the feed."}
      </p>
    </div>
  );
}
