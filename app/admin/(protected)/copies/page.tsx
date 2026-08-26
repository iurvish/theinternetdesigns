import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creators, mediaCopies, posts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Copies" };

export default async function AdminCopiesPage() {
  const [[{ total }], byCreator, byPost] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(mediaCopies),
    db
      .select({
        id: creators.id,
        username: creators.username,
        displayName: creators.displayName,
        avatarUrl: creators.avatarUrl,
        copies: sql<number>`count(${mediaCopies.id})::int`,
      })
      .from(mediaCopies)
      .innerJoin(creators, eq(creators.id, mediaCopies.creatorId))
      .groupBy(creators.id)
      .orderBy(desc(sql`count(${mediaCopies.id})`))
      .limit(50),
    db
      .select({
        id: posts.id,
        title: posts.title,
        caption: posts.caption,
        username: creators.username,
        displayName: creators.displayName,
        copies: sql<number>`count(${mediaCopies.id})::int`,
      })
      .from(mediaCopies)
      .innerJoin(posts, eq(posts.id, mediaCopies.postId))
      .innerJoin(creators, eq(creators.id, mediaCopies.creatorId))
      .groupBy(
        posts.id,
        posts.title,
        posts.caption,
        creators.username,
        creators.displayName,
      )
      .orderBy(desc(sql`count(${mediaCopies.id})`))
      .limit(50),
  ]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Copies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} clipboard {total === 1 ? "copy" : "copies"} across the gallery.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            By creator
          </h2>
          {byCreator.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
              {byCreator.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 border-b border-border/60 p-3 last:border-b-0"
                >
                  <div className="size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                    {c.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.avatarUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {c.displayName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      @{c.username}
                    </div>
                  </div>
                  <CopyCount n={c.copies} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            By post
          </h2>
          {byPost.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
              {byPost.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 border-b border-border/60 p-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/post/${p.id}`}
                      target="_blank"
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {p.title || p.caption?.slice(0, 80) || "(untitled)"}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">
                      @{p.username}
                      {p.displayName ? ` · ${p.displayName}` : ""}
                    </div>
                  </div>
                  <CopyCount n={p.copies} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CopyCount({ n }: { n: number }) {
  return (
    <span className="shrink-0 tabular-nums text-sm font-semibold">{n}</span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
      No copies yet.
    </div>
  );
}
