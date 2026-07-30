import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, postCategories } from "@/lib/db/schema";
import { CategoriesManager } from "./categories-manager";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      sortOrder: categories.sortOrder,
      postCount: sql<number>`count(${postCategories.postId})::int`,
    })
    .from(categories)
    .leftJoin(postCategories, eq(postCategories.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <CategoriesManager initialCategories={rows} />
    </div>
  );
}

export const metadata = { title: "Categories" };
