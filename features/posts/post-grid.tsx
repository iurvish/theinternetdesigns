import Link from "next/link";
import Image from "next/image";
import { Play, Images } from "lucide-react";
import type { PostListItem } from "./queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PostGrid({ posts }: { posts: PostListItem[] }) {
  if (posts.length === 0) return <EmptyState />;
  return (
    <div className="columns-1 gap-4 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 [column-fill:_balance]">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}

export function PostCard({ post }: { post: PostListItem }) {
  const aspectRatio =
    post.thumbnail?.width && post.thumbnail?.height
      ? `${post.thumbnail.width} / ${post.thumbnail.height}`
      : "4 / 5";
  return (
    <Link
      href={`/post/${post.id}`}
      className="group mb-4 block break-inside-avoid overflow-hidden rounded-2xl border border-border/60 bg-card transition-shadow hover:shadow-lg"
    >
      <div
        className="relative w-full bg-muted"
        style={{ aspectRatio }}
      >
        {post.thumbnail?.url ? (
          <Image
            src={post.thumbnail.url}
            alt={post.caption ?? post.title ?? ""}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : null}
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-between gap-2">
          {post.hasVideo ? (
            <Badge variant="secondary" className="gap-1 bg-black/60 text-white backdrop-blur-md">
              <Play className="size-3" /> Video
            </Badge>
          ) : (
            <span />
          )}
          {post.imageCount > 1 ? (
            <Badge variant="secondary" className="gap-1 bg-black/60 text-white backdrop-blur-md">
              <Images className="size-3" /> {post.imageCount}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <Avatar className="size-6">
            {post.creator.avatarUrl ? (
              <AvatarImage src={post.creator.avatarUrl} alt={post.creator.displayName} />
            ) : null}
            <AvatarFallback>{post.creator.displayName?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-medium text-foreground">
              {post.creator.displayName}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              @{post.creator.username}
            </span>
          </div>
        </div>
        {post.caption ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{post.caption}</p>
        ) : null}
        {post.categories.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {post.categories.slice(0, 3).map((c) => (
              <Badge key={c.slug} variant="outline" className="text-[10px] font-normal">
                {c.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export function PostGridSkeleton() {
  return (
    <div className="columns-1 gap-4 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="mb-4 break-inside-avoid">
          <Skeleton
            className={cn("w-full rounded-2xl", i % 3 === 0 ? "h-72" : i % 3 === 1 ? "h-56" : "h-96")}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-24 text-center">
      <h2 className="text-lg font-medium">No inspiration yet</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Add posts from the admin panel to start populating the feed.
      </p>
    </div>
  );
}
