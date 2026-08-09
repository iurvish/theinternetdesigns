import "server-only";

import { randomUUID } from "node:crypto";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { PUBLIC_CATEGORY_NAV } from "@/features/posts/public-categories";

/** Upsert public nav categories so admin pickers always have the full list. */
export async function ensurePublicCategories() {
  const existing = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(
      inArray(
        categories.slug,
        PUBLIC_CATEGORY_NAV.map((c) => c.slug),
      ),
    );
  const have = new Set(existing.map((c) => c.slug));
  const missing = PUBLIC_CATEGORY_NAV.filter((c) => !have.has(c.slug));

  if (missing.length > 0) {
    await db.insert(categories).values(
      missing.map((c, i) => ({
        id: randomUUID(),
        slug: c.slug,
        name: c.name,
        // Keep public nav near the top of sort order.
        sortOrder: i,
      })),
    );
  }

  const slugs = PUBLIC_CATEGORY_NAV.map((c) => c.slug);
  const rows = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(inArray(categories.slug, slugs))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const order = new Map(PUBLIC_CATEGORY_NAV.map((c, i) => [c.slug, i]));
  return rows.sort(
    (a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99),
  );
}
