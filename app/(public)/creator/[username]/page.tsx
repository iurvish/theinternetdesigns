import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { creators } from "@/lib/db/schema";
import { PostGrid } from "@/features/posts/post-grid";
import { getPostsByCreator } from "@/features/posts/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const [creator] = await db
    .select()
    .from(creators)
    .where(eq(creators.username, username))
    .limit(1);
  if (!creator) notFound();
  const posts = await getPostsByCreator(username, { limit: 120 });

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-center gap-4">
        <Avatar className="size-16">
          {creator.avatarUrl ? (
            <AvatarImage src={creator.avatarUrl} alt={creator.displayName} />
          ) : null}
          <AvatarFallback>{creator.displayName[0]}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{creator.displayName}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>@{creator.username}</span>
            {creator.profileUrl ? (
              <Link
                href={creator.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <ExternalLink className="size-3" /> View on X
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      <PostGrid posts={posts} />
    </div>
  );
}
