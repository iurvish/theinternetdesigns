"use client";

import Image from "next/image";
import Link from "next/link";
import type { SimilarPostItem } from "@/lib/db/similar-posts";
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
    <section
      className="mt-16"
      aria-labelledby="similar-designs-heading"
    >
      <h2
        id="similar-designs-heading"
        className="text-lg font-medium tracking-tight text-foreground"
      >
        Similar designs
      </h2>
      <div className="mt-6 columns-2 gap-3 sm:columns-3 [column-fill:_balance]">
        {posts.map((post) => (
          <SimilarCard key={post.id} post={post} href={`/post/${post.id}`} />
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
}: {
  post: SimilarCardData;
  href?: string;
  onSelect?: () => void;
}) {
  const aspectRatio =
    post.thumbWidth && post.thumbHeight
      ? `${post.thumbWidth} / ${post.thumbHeight}`
      : "4 / 5";
  const label =
    post.title?.trim() ||
    (post.creator.username ? `Design by @${post.creator.username}` : "Similar design");

  const inner = (
    <>
      <div className="relative w-full" style={{ aspectRatio }}>
        {post.thumbUrl ? (
          <Image
            src={post.thumbUrl}
            alt={label}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}
        {post.creator.avatarUrl ? (
          <span className="absolute bottom-2 left-2 size-6 overflow-hidden rounded-full shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)] sm:bottom-2.5 sm:left-2.5 sm:size-7.5">
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
      </div>
      <span className="sr-only">{label}</span>
    </>
  );

  const className =
    "group mb-2.5 block w-full break-inside-avoid overflow-hidden rounded-lg border border-[#e3e5e8] bg-[#ededef] outline outline-1 -outline-offset-1 outline-black/10 transition-shadow duration-200 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12)]";

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className={`${className} cursor-pointer text-left`}
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
