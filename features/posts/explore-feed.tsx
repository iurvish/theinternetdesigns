"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, ChevronDown, Play, Plus } from "lucide-react";
import type { PostListItem } from "./queries";
import { cn } from "@/lib/utils";

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
  posts,
  categories,
}: {
  posts: PostListItem[];
  categories: Category[];
}) {
  const [active, setActive] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const visible = useMemo(() => {
    const filtered =
      active === "all"
        ? posts
        : posts.filter((p) => p.categories.some((c) => c.slug === active));
    const sorted = [...filtered].sort((a, b) => {
      const at = a.publishedAt ? a.publishedAt.getTime() : 0;
      const bt = b.publishedAt ? b.publishedAt.getTime() : 0;
      return sort === "recent" ? bt - at : at - bt;
    });
    return sorted;
  }, [posts, active, sort]);

  return (
    <>
      {/* Filter toolbar */}
      <div className="flex w-full flex-col items-start border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]">
        <div className="flex w-full items-center gap-4 px-3.5">
          {/* Left: view controls */}
          <div className="flex shrink-0 items-center gap-2.5 py-3.5">
            <div className="flex shrink-0 items-center gap-2.5 rounded-xl bg-white px-2.5 py-2 shadow-[0_0_0_1px_rgba(232,232,232,0.6),0_3px_9px_0_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)]">
              <Image
                src="/figma/logo.svg"
                alt="Logo"
                width={20}
                height={20}
                className="size-6 shrink-0 p-0.5"
              />
              <span className="flex items-center rounded-sm border border-dashed border-[#e3e5e8] bg-[#f7f7f7] p-1 text-[#707275]">
                <Plus className="size-4" strokeWidth={2} />
              </span>
            </div>
            <LayoutPreview />
          </div>

          <Divider />

          {/* Middle: category pills */}
          <div className="relative flex min-w-0 flex-1 items-center overflow-x-auto py-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex items-center gap-3">
              <Pill
                label="All"
                active={active === "all"}
                onClick={() => setActive("all")}
              />
              {categories.map((c) => (
                <Pill
                  key={c.slug}
                  label={c.name}
                  active={active === c.slug}
                  onClick={() => setActive(c.slug)}
                />
              ))}
            </div>
            <div className="pointer-events-none sticky right-0 -ml-9 h-16 w-9 shrink-0 bg-gradient-to-l from-[#f7f7f7] to-[rgba(247,247,247,0)]" />
          </div>

          <Divider />

          {/* Right: sort */}
          <div className="flex shrink-0 items-start py-3.5">
            <SortMenu value={sort} onChange={setSort} />
          </div>
        </div>
      </div>

      {/* Masonry grid */}
      <div className="flex w-full flex-1 items-start gap-2.5 border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] p-3.5 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]">
        {visible.length === 0 ? (
          <EmptyState hasPosts={posts.length > 0} />
        ) : (
          <div className="w-full columns-2 gap-2.5 md:columns-3 [column-fill:_balance]">
            {visible.map((p, i) => (
              <MasonryCard key={p.id} post={p} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* Footer strip */}
      <div className="h-16 w-full shrink-0 border-r border-b border-l border-[#e3e5e8] bg-[#f7f7f7] shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]" />
    </>
  );
}

function Divider() {
  return <div className="h-9 w-px shrink-0 self-center bg-[#e3e5e8]" aria-hidden />;
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
        "flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.5 py-2.5 text-sm tracking-tight shadow-[0_0_0_0.5px_rgba(0,0,0,0.09),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)] transition-colors",
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
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-30 overflow-hidden rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgba(232,232,232,0.8),0_8px_24px_-6px_rgba(0,0,0,0.12)]">
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
        </div>
      ) : null}
    </div>
  );
}

/** Small skeuomorphic layout-preview widget from the toolbar (node 1:22). */
function LayoutPreview() {
  const columns = [
    ["h-4", "h-4"],
    ["h-1.5", "h-4"],
    ["h-4", "h-3.5"],
  ];
  return (
    <div className="flex h-9 w-38 shrink-0 items-center gap-1 overflow-hidden rounded-xl bg-white px-3 shadow-[0_0_0_1px_rgba(232,232,232,0.6),0_3px_9px_0_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)]">
      {columns.map((col, i) => (
        <div key={i} className="flex w-6 flex-col gap-0.5">
          {col.map((h, j) => (
            <div
              key={j}
              className={cn(
                "w-full rounded-sm bg-[#efeff0] shadow-[inset_0_0.5px_0_0_rgba(0,0,0,0.06)]",
                h,
              )}
            />
          ))}
        </div>
      ))}
      <div className="ml-auto h-4.5 w-px bg-[#e3e5e8]" />
    </div>
  );
}

function MasonryCard({ post, index }: { post: PostListItem; index: number }) {
  const aspectRatio =
    post.thumbnail?.width && post.thumbnail?.height
      ? `${post.thumbnail.width} / ${post.thumbnail.height}`
      : index % 3 === 0
        ? "720 / 900"
        : index % 3 === 1
          ? "1"
          : "1066 / 720";

  return (
    <Link
      href={`/post/${post.id}`}
      className="group relative mb-2.5 block break-inside-avoid overflow-hidden rounded-lg border border-[#e3e5e8] bg-[#ededef]"
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
    </Link>
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
