"use client";

import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { SimilarPostItem } from "@/lib/db/similar-posts";
import { cn } from "@/lib/utils";
import type { PostListItem } from "./queries";

export type SimilarCardData = {
  id: string;
  title: string | null;
  thumbUrl: string | null;
  thumbWidth: number | null;
  thumbHeight: number | null;
  creator: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

/** Light page vs. the lightbox's blurred-dark backdrop. */
type Tone = "light" | "glass";

export function similarCardFromListItem(post: PostListItem): SimilarCardData {
  return {
    id: post.id,
    title: post.title,
    thumbUrl: post.thumbnail?.url ?? null,
    thumbWidth: post.thumbnail?.width ?? null,
    thumbHeight: post.thumbnail?.height ?? null,
    creator: {
      username: post.creator.username,
      displayName: post.creator.displayName,
      avatarUrl: post.creator.avatarUrl,
    },
  };
}

export function SimilarDesigns({ posts }: { posts: SimilarPostItem[] }) {
  if (posts.length === 0) return null;

  return (
    <section className="mt-16" aria-labelledby="similar-designs-heading">
      {/* Label the strip before it scrolls into view — "more like this" is the
          reason to keep going, so it reads as an invitation, not a footer. */}
      <div className="flex items-center gap-2.5 border-b border-border/60 pb-3">
        <Sparkles
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.8}
          aria-hidden
        />
        <h2
          id="similar-designs-heading"
          className="text-[15px] font-medium tracking-tight text-foreground"
        >
          More designs like this
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {posts.length}
        </span>
      </div>
      <div className="mt-5 columns-2 gap-3 sm:columns-3 [column-fill:_balance]">
        {posts.map((post) => (
          <SimilarCard
            key={post.id}
            post={post}
            href={`/post/${post.id}`}
            tone="light"
          />
        ))}
      </div>
    </section>
  );
}

export function OverlaySimilarGrid({
  posts,
  onSelect,
}: {
  posts: SimilarCardData[];
  onSelect: (id: string) => void;
}) {
  if (posts.length === 0) return null;

  return (
    <div className="columns-2 gap-2.5 sm:columns-3 [column-fill:_balance]">
      {posts.map((post) => (
        <SimilarCard
          key={post.id}
          post={post}
          tone="glass"
          onSelect={() => onSelect(post.id)}
        />
      ))}
    </div>
  );
}

function SimilarCard({
  post,
  href,
  onSelect,
  tone = "light",
}: {
  post: SimilarCardData;
  href?: string;
  onSelect?: () => void;
  tone?: Tone;
}) {
  const aspectRatio =
    post.thumbWidth && post.thumbHeight
      ? `${post.thumbWidth} / ${post.thumbHeight}`
      : "4 / 5";
  const label =
    post.title?.trim() ||
    (post.creator.username
      ? `Design by @${post.creator.username}`
      : "Similar design");

  const inner = (
    <>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio }}>
        {post.thumbUrl ? (
          <Image
            src={post.thumbUrl}
            alt={label}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
            className="object-cover transition-transform duration-[400ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-[1.04] motion-reduce:transform-none motion-reduce:transition-none"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}

        {/* Creator credit — always-on avatar, name on hover. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-2 sm:p-2.5">
          {post.creator.avatarUrl ? (
            <span className="size-6 shrink-0 overflow-hidden rounded-full shadow-[0_1px_3px_0_rgba(0,0,0,0.25)] sm:size-7">
              <Image
                src={post.creator.avatarUrl}
                alt=""
                width={30}
                height={30}
                className="size-full object-cover"
                unoptimized
              />
            </span>
          ) : null}
          {post.creator.displayName ? (
            <span className="min-w-0 translate-y-1 truncate rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 backdrop-blur-sm transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
              {post.creator.displayName}
            </span>
          ) : null}
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </>
  );

  const className = cn(
    "group mb-2.5 block w-full break-inside-avoid overflow-hidden rounded-xl transition-[box-shadow,transform] duration-200",
    "hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none",
    tone === "glass"
      ? "bg-white/10 ring-1 ring-inset ring-white/15 hover:shadow-[0_10px_28px_-8px_rgba(0,0,0,0.45)]"
      : "border border-[#e3e5e8] bg-[#ededef] outline outline-1 -outline-offset-1 outline-black/10 hover:shadow-[0_6px_20px_-6px_rgba(0,0,0,0.16)]",
  );

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className={cn(className, "cursor-pointer text-left")}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link href={href ?? `/post/${post.id}`} className={className}>
      {inner}
    </Link>
  );
}
