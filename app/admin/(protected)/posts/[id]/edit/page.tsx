import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, postCategories, posts } from "@/lib/db/schema";
import { ensurePublicCategories } from "@/lib/db/ensure-public-categories";
import { EditPostForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!post) notFound();

  const [cats, currentLinks, mediaRows] = await Promise.all([
    ensurePublicCategories(),
    db
      .select({ categoryId: postCategories.categoryId })
      .from(postCategories)
      .where(eq(postCategories.postId, id)),
    db
      .select({
        id: media.id,
        kind: media.kind,
        position: media.position,
        thumbnailUrl: media.thumbnailUrl,
        posterUrl: media.posterUrl,
        originalUrl: media.originalUrl,
        colors: media.colors,
      })
      .from(media)
      .where(eq(media.postId, id))
      .orderBy(asc(media.position)),
  ]);

  const mediaItems = mediaRows.map((m) => ({
    id: m.id,
    kind: m.kind,
    still: m.thumbnailUrl ?? m.posterUrl ?? m.originalUrl,
    colors: m.colors ?? [],
  }));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit post</h1>
      <EditPostForm
        postId={post.id}
        initialTitle={post.title ?? ""}
        initialCaption={post.caption ?? ""}
        initialPublished={post.published}
        initialAutoplayInFeed={post.autoplayInFeed}
        initialFeatured={post.featured}
        initialHiddenGem={post.hiddenGem}
        initialInteraction={post.interaction ?? null}
        hasVideo={post.hasVideo}
        initialCategoryIds={currentLinks.map((l) => l.categoryId)}
        categories={cats}
        media={mediaItems}
      />
    </div>
  );
}

export const metadata = { title: "Edit post" };
