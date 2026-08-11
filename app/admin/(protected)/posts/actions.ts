"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories as categoriesTable,
  industries as industriesTable,
  media as mediaTable,
  postCategories,
  postIndustries,
  postStyles,
  posts,
  styles as stylesTable,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteR2Urls } from "@/lib/r2/delete";
import { sanitizePalette } from "@/lib/media/color-utils";
import { extractPalette, type PaletteColor } from "@/lib/media/colors";

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
  autoplayInFeed: boolean;
  featured: boolean;
  hiddenGem: boolean;
  interaction: string | null;
  categoryIds: string[];
  industryIds?: string[];
  styleIds?: string[];
  /** Admin-edited colour palettes, keyed by media id. */
  mediaColors?: { mediaId: string; colors: PaletteColor[] }[];
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
          autoplayInFeed: input.autoplayInFeed,
          featured: input.featured,
          hiddenGem: input.hiddenGem,
          interaction: input.interaction?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, input.postId));

      // Persist edited palettes — re-deriving r/g/b from hex so colour search
      // stays consistent with what the admin sees.
      for (const entry of input.mediaColors ?? []) {
        await tx
          .update(mediaTable)
          .set({ colors: sanitizePalette(entry.colors) })
          .where(and(eq(mediaTable.id, entry.mediaId), eq(mediaTable.postId, input.postId)));
      }

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

      await tx.delete(postIndustries).where(eq(postIndustries.postId, input.postId));

      if ((input.industryIds?.length ?? 0) > 0) {
        const valid = await tx
          .select({ id: industriesTable.id })
          .from(industriesTable)
          .where(inArray(industriesTable.id, input.industryIds!));
        const rows = valid.map((i) => ({
          postId: input.postId,
          industryId: i.id,
        }));
        if (rows.length > 0) await tx.insert(postIndustries).values(rows);
      }

      await tx.delete(postStyles).where(eq(postStyles.postId, input.postId));

      if ((input.styleIds?.length ?? 0) > 0) {
        const valid = await tx
          .select({ id: stylesTable.id })
          .from(stylesTable)
          .where(inArray(stylesTable.id, input.styleIds!));
        const rows = valid.map((s) => ({
          postId: input.postId,
          styleId: s.id,
        }));
        if (rows.length > 0) await tx.insert(postStyles).values(rows);
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

export type ReextractResult =
  | { ok: true; colors: PaletteColor[] }
  | { ok: false; error: string };

/**
 * Recompute a media's palette from its stored still — the "let the machine pick
 * again" escape hatch in the editor. Returns the fresh palette for the client
 * to preview; the admin still has to Save to persist it.
 */
export async function reextractMediaColors(
  mediaId: string,
): Promise<ReextractResult> {
  await requireAdmin();
  try {
    const [row] = await db
      .select({
        kind: mediaTable.kind,
        originalUrl: mediaTable.originalUrl,
        thumbnailUrl: mediaTable.thumbnailUrl,
        posterUrl: mediaTable.posterUrl,
      })
      .from(mediaTable)
      .where(eq(mediaTable.id, mediaId))
      .limit(1);
    if (!row) return { ok: false, error: "Media not found." };

    const still =
      row.kind === "image"
        ? row.thumbnailUrl ?? row.originalUrl
        : row.posterUrl ?? row.thumbnailUrl;
    if (!still) return { ok: false, error: "This media has no still to sample." };

    const res = await fetch(still, {
      headers: { "user-agent": "Mozilla/5.0 (idesigns)" },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `Fetch failed (${res.status}).` };
    const buffer = Buffer.from(new Uint8Array(await res.arrayBuffer()));
    const colors = await extractPalette(buffer);
    return { ok: true, colors };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Re-extract failed." };
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
