"use server";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { creators, media as mediaTable, posts } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteR2Urls } from "@/lib/r2/delete";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type CreatorInput = {
  username: string;
  displayName: string;
  bio?: string;
  profileUrl?: string;
};

export async function updateCreator(
  id: string,
  input: CreatorInput,
): Promise<ActionResult> {
  await requireAdmin();
  const username = input.username.trim().replace(/^@/, "");
  const displayName = input.displayName.trim();
  if (!username) return { ok: false, error: "Username is required." };
  if (!displayName) return { ok: false, error: "Display name is required." };

  try {
    const [current] = await db
      .select({ source: creators.source })
      .from(creators)
      .where(eq(creators.id, id))
      .limit(1);
    if (!current) return { ok: false, error: "Creator not found." };

    const [conflict] = await db
      .select({ id: creators.id })
      .from(creators)
      .where(
        and(
          eq(creators.source, current.source),
          eq(creators.username, username),
          ne(creators.id, id),
        ),
      )
      .limit(1);
    if (conflict) return { ok: false, error: `Username @${username} is already used.` };

    await db
      .update(creators)
      .set({
        username,
        displayName,
        bio: input.bio?.trim() || null,
        profileUrl: input.profileUrl?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(creators.id, id));

    revalidatePath("/admin/creators");
    revalidatePath("/creators");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Update failed." };
  }
}

export async function deleteCreator(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    const postRows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.creatorId, id));
    const postIds = postRows.map((p) => p.id);

    const mediaRows = postIds.length
      ? await db
          .select({
            originalUrl: mediaTable.originalUrl,
            thumbnailUrl: mediaTable.thumbnailUrl,
            mediumUrl: mediaTable.mediumUrl,
            posterUrl: mediaTable.posterUrl,
          })
          .from(mediaTable)
      : [];

    const [{ avatarUrl }] = await db
      .select({ avatarUrl: creators.avatarUrl })
      .from(creators)
      .where(eq(creators.id, id))
      .limit(1);

    await db.delete(creators).where(eq(creators.id, id));

    try {
      await deleteR2Urls([
        avatarUrl,
        ...mediaRows.flatMap((m) => [
          m.originalUrl,
          m.thumbnailUrl,
          m.mediumUrl,
          m.posterUrl,
        ]),
      ]);
    } catch (err) {
      console.error("[deleteCreator] R2 cleanup failed", err);
    }

    revalidatePath("/");
    revalidatePath("/admin/creators");
    revalidatePath("/admin/posts");
    revalidatePath("/creators");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed." };
  }
}
