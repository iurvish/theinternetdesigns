import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creators, posts } from "@/lib/db/schema";
import { CreatorsManager } from "./creators-manager";

export const dynamic = "force-dynamic";

export default async function AdminCreatorsPage() {
  const rows = await db
    .select({
      id: creators.id,
      username: creators.username,
      displayName: creators.displayName,
      avatarUrl: creators.avatarUrl,
      bio: creators.bio,
      profileUrl: creators.profileUrl,
      postCount: sql<number>`count(${posts.id})::int`,
    })
    .from(creators)
    .leftJoin(posts, eq(posts.creatorId, creators.id))
    .groupBy(creators.id)
    .orderBy(asc(creators.username));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <CreatorsManager initialCreators={rows} />
    </div>
  );
}

export const metadata = { title: "Creators" };
