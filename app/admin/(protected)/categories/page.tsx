import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";

export default async function AdminCategoriesPage() {
  const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Categories</h1>
      <div className="rounded-2xl border border-border/60 bg-card">
        {rows.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between border-b border-border/60 px-4 py-3 last:border-b-0"
          >
            <div>
              <div className="text-sm font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground">/{c.slug}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const metadata = { title: "Categories" };
