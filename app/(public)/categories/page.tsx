import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";

export default async function CategoriesPage() {
  const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">Categories</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {rows.map((c) => (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            className="rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="text-sm font-medium">{c.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export const metadata = { title: "Categories" };
