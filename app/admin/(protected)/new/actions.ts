"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories as categoriesTable,
  creators,
  media as mediaTable,
  postCategories,
  posts,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parseTweetId } from "@/lib/providers/tweet/parse-url";
import { fetchTweet, type NormalizedTweet } from "@/lib/providers/tweet/syndication";
import { processImage, processVideo, uploadAvatar } from "@/lib/media/process";

export type PreviewResult =
  | { ok: true; tweet: NormalizedTweet; existing: boolean }
  | { ok: false; error: string };

export async function fetchPreview(input: string): Promise<PreviewResult> {
  await requireAdmin();
  const id = parseTweetId(input);
  if (!id) return { ok: false, error: "Not a valid X/Twitter URL or tweet id." };
  try {
    const tweet = await fetchTweet(id);
    if (tweet.media.length === 0) {
      return { ok: false, error: "This tweet has no media." };
    }
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.source, "x"), eq(posts.sourceId, id)))
      .limit(1);
    return { ok: true, tweet, existing: Boolean(existing) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fetch failed." };
  }
}

export type PublishInput = {
  tweetId: string;
  title: string;
  caption: string;
  categoryIds: string[];
};

export type PublishResult =
  | { ok: true; postId: string }
  | { ok: false; error: string };

export async function publishPost(input: PublishInput): Promise<PublishResult> {
  await requireAdmin();
  const id = parseTweetId(input.tweetId);
  if (!id) return { ok: false, error: "Invalid tweet id." };

  try {
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.source, "x"), eq(posts.sourceId, id)))
      .limit(1);
    if (existing) {
      return { ok: false, error: "This tweet is already published." };
    }

    const tweet = await fetchTweet(id);
    if (tweet.media.length === 0) {
      return { ok: false, error: "This tweet has no media." };
    }

    let [creator] = await db
      .select()
      .from(creators)
      .where(and(eq(creators.source, "x"), eq(creators.sourceId, tweet.creator.sourceId)))
      .limit(1);

    if (!creator) {
      const creatorId = randomUUID();
      let avatarUrl: string | null = null;
      if (tweet.creator.avatarUrl) {
        avatarUrl = await uploadAvatar(
          tweet.creator.avatarUrl.replace(/_normal(\.[a-z]+)?$/i, "$1"),
          `x/creators/${tweet.creator.sourceId}`,
        );
      }
      const [inserted] = await db
        .insert(creators)
        .values({
          id: creatorId,
          source: "x",
          sourceId: tweet.creator.sourceId,
          username: tweet.creator.username,
          displayName: tweet.creator.displayName,
          avatarUrl,
          profileUrl: tweet.creator.profileUrl,
        })
        .returning();
      creator = inserted;
    }

    const postId = randomUUID();
    const keyBase = `x/posts/${id}`;

    const processedMedia = await Promise.all(
      tweet.media.map(async (m, i) => {
        const keyPrefix = `${keyBase}/${i}`;
        if (m.kind === "image") {
          const p = await processImage(m.url, keyPrefix);
          return {
            id: randomUUID(),
            postId,
            kind: "image" as const,
            position: i,
            originalUrl: p.originalUrl,
            thumbnailUrl: p.thumbnailUrl,
            mediumUrl: null,
            posterUrl: null,
            width: p.width ?? m.width,
            height: p.height ?? m.height,
            durationMs: null,
            sourceMediaUrl: m.url,
            colors: p.colors,
          };
        }
        const p = await processVideo(m.url, m.posterUrl, keyPrefix);
        return {
          id: randomUUID(),
          postId,
          kind: m.kind,
          position: i,
          originalUrl: p.originalUrl,
          thumbnailUrl: p.posterUrl,
          mediumUrl: null,
          posterUrl: p.posterUrl,
          width: m.width,
          height: m.height,
          durationMs: m.durationMs,
          sourceMediaUrl: m.url,
          colors: p.colors,
        };
      }),
    );

    const imageCount = processedMedia.filter((m) => m.kind === "image").length;
    const hasVideo = processedMedia.some((m) => m.kind === "video" || m.kind === "gif");
    const publishedAt = tweet.createdAt ? new Date(tweet.createdAt) : new Date();

    await db.transaction(async (tx) => {
      await tx.insert(posts).values({
        id: postId,
        source: "x",
        sourceId: id,
        sourceUrl: tweet.url,
        creatorId: creator!.id,
        title: input.title.trim() || null,
        caption: input.caption.trim() || tweet.text || null,
        rawText: tweet.text,
        providerMeta: tweet.raw as object,
        publishedAt,
        hasVideo,
        imageCount,
        published: true,
      });
      await tx.insert(mediaTable).values(processedMedia);
      if (input.categoryIds.length > 0) {
        const validCats = await tx
          .select({ id: categoriesTable.id })
          .from(categoriesTable);
        const valid = new Set(validCats.map((c) => c.id));
        const rows = input.categoryIds
          .filter((cid) => valid.has(cid))
          .map((cid) => ({ postId, categoryId: cid }));
        if (rows.length > 0) await tx.insert(postCategories).values(rows);
      }
    });

    revalidatePath("/");
    revalidatePath("/admin/posts");
    return { ok: true, postId };
  } catch (err) {
    console.error("[publishPost] failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Publish failed." };
  }
}
