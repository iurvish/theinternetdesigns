import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, postCategories, posts } from "@/lib/db/schema";
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

  const [cats, currentLinks] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name, slug: categories.slug })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({ categoryId: postCategories.categoryId })
      .from(postCategories)
      .where(eq(postCategories.postId, id)),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit post</h1>
      <EditPostForm
        postId={post.id}
        initialTitle={post.title ?? ""}
        initialCaption={post.caption ?? ""}
        initialPublished={post.published}
        initialCategoryIds={currentLinks.map((l) => l.categoryId)}
        categories={cats}
      />
    </div>
  );
}

export const metadata = { title: "Edit post" };
