import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { NewPostForm } from "./new-post-form";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const cats = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New post</h1>
      <NewPostForm categories={cats} />
    </div>
  );
}

export const metadata = { title: "New post" };
