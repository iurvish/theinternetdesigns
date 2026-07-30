"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories as categoriesTable,
  media as mediaTable,
  postCategories,
  posts,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteR2Urls } from "@/lib/r2/delete";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function deletePost(postId: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    const mediaRows = await db
      .select({
        originalUrl: mediaTable.originalUrl,
        thumbnailUrl: mediaTable.thumbnailUrl,
        mediumUrl: mediaTable.mediumUrl,
        posterUrl: mediaTable.posterUrl,
      })
      .from(mediaTable)
      .where(eq(mediaTable.postId, postId));

    await db.delete(posts).where(eq(posts.id, postId));

    try {
      await deleteR2Urls(
        mediaRows.flatMap((m) => [
          m.originalUrl,
          m.thumbnailUrl,
          m.mediumUrl,
          m.posterUrl,
        ]),
      );
    } catch (err) {
      console.error("[deletePost] R2 cleanup failed", err);
    }

    revalidatePath("/");
    revalidatePath("/admin/posts");
    return { ok: true };
  } catch (err) {
    console.error("[deletePost] failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed." };
  }
}

export type UpdatePostInput = {
  postId: string;
  title: string;
  caption: string;
  published: boolean;
  categoryIds: string[];
};

export async function updatePost(input: UpdatePostInput): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(posts)
        .set({
          title: input.title.trim() || null,
          caption: input.caption.trim() || null,
          published: input.published,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, input.postId));

      await tx.delete(postCategories).where(eq(postCategories.postId, input.postId));

      if (input.categoryIds.length > 0) {
        const valid = await tx
          .select({ id: categoriesTable.id })
          .from(categoriesTable)
          .where(inArray(categoriesTable.id, input.categoryIds));
        const rows = valid.map((c) => ({
          postId: input.postId,
          categoryId: c.id,
        }));
        if (rows.length > 0) await tx.insert(postCategories).values(rows);
      }
    });

    revalidatePath("/");
    revalidatePath("/admin/posts");
    revalidatePath(`/post/${input.postId}`);
    return { ok: true };
  } catch (err) {
    console.error("[updatePost] failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Update failed." };
  }
}

export async function togglePublished(
  postId: string,
  published: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db
      .update(posts)
      .set({ published, updatedAt: new Date() })
      .where(and(eq(posts.id, postId)));
    revalidatePath("/");
    revalidatePath("/admin/posts");
    revalidatePath(`/post/${postId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Update failed." };
  }
}
