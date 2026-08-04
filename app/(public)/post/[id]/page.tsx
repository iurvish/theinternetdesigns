import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getPostById } from "@/features/posts/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { VideoPlayer } from "@/components/video-player";
import { PostPalette } from "@/features/posts/post-palette";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPostById(id);
  if (!data || !data.creator) notFound();
  const { post, creator, media, categories } = data;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/creator/${creator.username}`} className="flex items-center gap-3">
          <Avatar className="size-10">
            {creator.avatarUrl ? (
              <AvatarImage src={creator.avatarUrl} alt={creator.displayName} />
            ) : null}
            <AvatarFallback>{creator.displayName[0]}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">{creator.displayName}</span>
            <span className="text-xs text-muted-foreground">@{creator.username}</span>
          </div>
        </Link>
        <div className="ml-auto">
          <Link
            href={post.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ExternalLink className="mr-1 size-3" /> Original post
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {media.map((m) => (
          <div
            key={m.id}
            className="overflow-hidden rounded-2xl border border-border/60 bg-muted"
          >
            {m.kind === "video" || m.kind === "gif" ? (
              <VideoPlayer
                src={m.originalUrl}
                poster={m.posterUrl ?? m.thumbnailUrl}
                mode={m.kind === "gif" ? "gif" : "video"}
              />
            ) : (
              <div
                className="relative w-full"
                style={{
                  aspectRatio:
                    m.width && m.height ? `${m.width} / ${m.height}` : "4 / 3",
                }}
              >
                <Image
                  src={m.mediumUrl ?? m.originalUrl}
                  alt={post.caption ?? ""}
                  fill
                  sizes="(max-width: 1024px) 100vw, 1024px"
                  className="object-contain"
                />
              </div>
            )}
            <PostPalette colors={m.colors ?? []} />
          </div>
        ))}
      </div>

      {post.caption ? (
        <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-foreground">
          {post.caption}
        </p>
      ) : null}

      {categories.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {categories.map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`}>
              <Badge variant="secondary" className="hover:bg-accent">
                {c.name}
              </Badge>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPostById(id);
  if (!data || !data.creator) return {};
  return {
    title: data.post.caption?.slice(0, 60) ?? `Post by @${data.creator.username}`,
    description: data.post.caption ?? undefined,
  };
}
