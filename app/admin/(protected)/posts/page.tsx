import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { creators, media as mediaTable, posts } from "@/lib/db/schema";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PostRowActions } from "./post-row-actions";

export const dynamic = "force-dynamic";

export default async function AdminPostsPage() {
  const rows = await db
    .select()
    .from(posts)
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(200);

  const creatorIds = Array.from(new Set(rows.map((r) => r.creatorId)));
  const postIds = rows.map((r) => r.id);

  const [creatorRows, thumbRows] = await Promise.all([
    creatorIds.length
      ? db.select().from(creators).where(inArray(creators.id, creatorIds))
      : Promise.resolve([]),
    postIds.length
      ? db
          .select()
          .from(mediaTable)
          .where(and(inArray(mediaTable.postId, postIds), eq(mediaTable.position, 0)))
      : Promise.resolve([]),
  ]);

  const creatorById = new Map(creatorRows.map((c) => [c.id, c]));
  const thumbByPost = new Map(thumbRows.map((m) => [m.postId, m]));

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Posts</h1>
        <Link href="/admin/new" className={buttonVariants()}>
          New post
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center text-sm text-muted-foreground">
          No posts yet. Create your first one from &quot;New post&quot;.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          {rows.map((p) => {
            const c = creatorById.get(p.creatorId);
            const thumb = thumbByPost.get(p.id);
            const thumbUrl =
              thumb?.thumbnailUrl ?? thumb?.mediumUrl ?? thumb?.originalUrl ?? null;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 border-b border-border/60 p-3 last:border-b-0"
              >
                <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/post/${p.id}`}
                      target="_blank"
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {p.title || p.caption?.slice(0, 80) || "(untitled)"}
                    </Link>
                    {!p.published ? (
                      <Badge variant="outline" className="text-[10px]">
                        draft
                      </Badge>
                    ) : null}
                    {p.hasVideo ? (
                      <Badge variant="secondary" className="text-[10px]">
                        video
                      </Badge>
                    ) : null}
                    {p.imageCount > 0 ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {p.imageCount} img
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {c ? <span>@{c.username}</span> : null}
                    <span>·</span>
                    <span>
                      {p.publishedAt ? new Date(p.publishedAt).toLocaleString() : "—"}
                    </span>
                  </div>
                </div>
                <PostRowActions postId={p.id} published={p.published} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const metadata = { title: "Posts" };
