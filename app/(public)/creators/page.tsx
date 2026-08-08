import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creators, posts } from "@/lib/db/schema";
import { creatorProfileUrl } from "@/features/posts/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default async function CreatorsPage() {
  const rows = await db
    .select({
      username: creators.username,
      displayName: creators.displayName,
      avatarUrl: creators.avatarUrl,
      profileUrl: creators.profileUrl,
      postCount: sql<number>`count(${posts.id})::int`,
    })
    .from(creators)
    .leftJoin(posts, sql`${posts.creatorId} = ${creators.id} and ${posts.published} = true`)
    .groupBy(creators.id)
    .orderBy(asc(creators.username));

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">Creators</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {rows.map((c) => (
          <a
            key={c.username}
            href={creatorProfileUrl(c) ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card p-4 text-center transition-colors hover:bg-accent"
          >
            <Avatar className="size-14">
              {c.avatarUrl ? <AvatarImage src={c.avatarUrl} alt={c.displayName} /> : null}
              <AvatarFallback>{c.displayName[0]}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{c.displayName}</div>
              <div className="truncate text-xs text-muted-foreground">
                @{c.username} · {c.postCount}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export const metadata = { title: "Creators" };
