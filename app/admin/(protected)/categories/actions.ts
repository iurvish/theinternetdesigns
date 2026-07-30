"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, postCategories } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export type CategoryInput = {
  name: string;
  slug: string;
  description?: string;
  sortOrder?: number;
};

export async function createCategory(
  input: CategoryInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const name = input.name.trim();
  const slug = slugify(input.slug || input.name);
  if (!name) return { ok: false, error: "Name is required." };
  if (!slug) return { ok: false, error: "Slug is required." };

  try {
    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);
    if (existing) return { ok: false, error: `Slug "${slug}" is already used.` };

    const id = randomUUID();
    await db.insert(categories).values({
      id,
      name,
      slug,
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    });
    revalidatePath("/admin/categories");
    revalidatePath("/categories");
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Create failed." };
  }
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
): Promise<ActionResult> {
  await requireAdmin();
  const name = input.name.trim();
  const slug = slugify(input.slug || input.name);
  if (!name) return { ok: false, error: "Name is required." };
  if (!slug) return { ok: false, error: "Slug is required." };

  try {
    const [conflict] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, slug), ne(categories.id, id)))
      .limit(1);
    if (conflict) return { ok: false, error: `Slug "${slug}" is already used.` };

    await db
      .update(categories)
      .set({
        name,
        slug,
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder ?? 0,
      })
      .where(eq(categories.id, id));
    revalidatePath("/admin/categories");
    revalidatePath("/categories");
    revalidatePath(`/category/${slug}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Update failed." };
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(postCategories)
      .where(eq(postCategories.categoryId, id));
    if (count > 0) {
      return {
        ok: false,
        error: `Cannot delete — ${count} post${count === 1 ? "" : "s"} still use this category.`,
      };
    }
    await db.delete(categories).where(eq(categories.id, id));
    revalidatePath("/admin/categories");
    revalidatePath("/categories");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed." };
  }
}
