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
import { parseTweetId, parseTweetIds } from "@/lib/providers/tweet/parse-url";
import { fetchTweet, type NormalizedTweet } from "@/lib/providers/tweet/syndication";
import { parsePinId, parsePinIds } from "@/lib/providers/pinterest/parse-url";
import {
  fetchPin,
  type NormalizedPin,
} from "@/lib/providers/pinterest/fetch-pin";
import { processImage, processVideo, uploadAvatar } from "@/lib/media/process";
import { extractPalette, type PaletteColor } from "@/lib/media/colors";
import { firstFramePalette } from "@/lib/media/video-frame";
import { sanitizePalette } from "@/lib/media/color-utils";
import { cleanCaptionForDisplay } from "@/lib/providers/tweet/clean-caption";

export type PreviewResult =
  | {
      ok: true;
      tweet: NormalizedTweet;
      existing: boolean;
      /** Dominant palette per media (same order as tweet.media). */
      colors: PaletteColor[][];
    }
  | { ok: false; error: string };

/** Extract a palette from a media URL, tolerant of fetch/decoding failures. */
async function paletteFromUrl(url: string | null): Promise<PaletteColor[]> {
  if (!url) return [];
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (idesigns)" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const buffer = Buffer.from(new Uint8Array(await res.arrayBuffer()));
    return await extractPalette(buffer);
  } catch {
    return [];
  }
}

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
    const existingFlag = Boolean(existing);
    // Extract palettes up front so the admin can review/edit before publishing.
    const colors = existingFlag
      ? []
      : await Promise.all(
          tweet.media.map(async (m) => {
            if (m.kind === "image") return paletteFromUrl(m.url);
            // Video/gif: pull colours from the clip's real first frame — X's
            // poster thumbnail is often a different/unrepresentative frame. Fall
            // back to that poster if frame decoding isn't available.
            return (await firstFramePalette(m.url)) ?? paletteFromUrl(m.posterUrl);
          }),
        );
    return { ok: true, tweet, existing: existingFlag, colors };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fetch failed." };
  }
}

export type PublishInput = {
  tweetId: string;
  title: string;
  caption: string;
  categoryIds: string[];
  /** Admin-reviewed palette per media (same order as tweet.media). */
  mediaColors?: PaletteColor[][];
  /** Autoplay the post's video in the feed (only meaningful for video posts). */
  autoplayInFeed?: boolean;
  featured?: boolean;
  hiddenGem?: boolean;
  interaction?: string | null;
};

export type BulkPreviewItem =
  | {
      ok: true;
      tweetId: string;
      tweet: NormalizedTweet;
      existing: boolean;
      colors: PaletteColor[][];
    }
  | { ok: false; tweetId: string; input: string; error: string };

export type BulkPreviewResult =
  | { ok: true; items: BulkPreviewItem[] }
  | { ok: false; error: string };

/** Fetch many X posts from a pasted blob of URLs (one per line or space-separated). */
export async function fetchBulkPreviews(blob: string): Promise<BulkPreviewResult> {
  await requireAdmin();
  const ids = parseTweetIds(blob);
  if (ids.length === 0) {
    return { ok: false, error: "No valid X/Twitter URLs found." };
  }
  if (ids.length > 25) {
    return { ok: false, error: "Paste at most 25 URLs at a time." };
  }

  const items: BulkPreviewItem[] = [];
  for (const id of ids) {
    try {
      const tweet = await fetchTweet(id);
      if (tweet.media.length === 0) {
        items.push({
          ok: false,
          tweetId: id,
          input: id,
          error: "This tweet has no media.",
        });
        continue;
      }
      const [existing] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.source, "x"), eq(posts.sourceId, id)))
        .limit(1);
      const existingFlag = Boolean(existing);
      const colors = existingFlag
        ? []
        : await Promise.all(
            tweet.media.map(async (m) => {
              if (m.kind === "image") return paletteFromUrl(m.url);
              return (await firstFramePalette(m.url)) ?? paletteFromUrl(m.posterUrl);
            }),
          );
      items.push({
        ok: true,
        tweetId: id,
        tweet,
        existing: existingFlag,
        colors,
      });
    } catch (err) {
      items.push({
        ok: false,
        tweetId: id,
        input: id,
        error: err instanceof Error ? err.message : "Fetch failed.",
      });
    }
  }

  return { ok: true, items };
}

export type PublishResult =
  | { ok: true; postId: string }
  | { ok: false; error: string };

export type PinPreviewResult =
  | {
      ok: true;
      pin: NormalizedPin;
      existing: boolean;
      colors: PaletteColor[][];
    }
  | { ok: false; error: string };

export type BulkPinPreviewItem =
  | {
      ok: true;
      pinId: string;
      pin: NormalizedPin;
      existing: boolean;
      colors: PaletteColor[][];
    }
  | { ok: false; pinId: string; input: string; error: string };

export type BulkPinPreviewResult =
  | { ok: true; items: BulkPinPreviewItem[] }
  | { ok: false; error: string };

async function colorsForPinMedia(
  pin: NormalizedPin,
  existing: boolean,
): Promise<PaletteColor[][]> {
  if (existing) return [];
  return Promise.all(
    pin.media.map(async (m) => {
      if (m.kind === "image") return paletteFromUrl(m.url);
      return (await firstFramePalette(m.url)) ?? paletteFromUrl(m.posterUrl);
    }),
  );
}

export async function fetchPinPreview(input: string): Promise<PinPreviewResult> {
  await requireAdmin();
  const ids = await parsePinIds(input);
  const id = ids[0] ?? parsePinId(input);
  if (!id) return { ok: false, error: "Not a valid Pinterest pin URL." };
  try {
    const pin = await fetchPin(id);
    if (pin.media.length === 0) {
      return { ok: false, error: "This pin has no downloadable media." };
    }
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.source, "pinterest"), eq(posts.sourceId, id)))
      .limit(1);
    const existingFlag = Boolean(existing);
    return {
      ok: true,
      pin,
      existing: existingFlag,
      colors: await colorsForPinMedia(pin, existingFlag),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Fetch failed.",
    };
  }
}

export async function fetchBulkPinPreviews(
  blob: string,
): Promise<BulkPinPreviewResult> {
  await requireAdmin();
  const ids = await parsePinIds(blob);
  if (ids.length === 0) {
    return { ok: false, error: "No valid Pinterest pin URLs found." };
  }
  if (ids.length > 25) {
    return { ok: false, error: "Paste at most 25 URLs at a time." };
  }

  const items: BulkPinPreviewItem[] = [];
  for (const id of ids) {
    try {
      const pin = await fetchPin(id);
      if (pin.media.length === 0) {
        items.push({
          ok: false,
          pinId: id,
          input: id,
          error: "This pin has no downloadable media.",
        });
        continue;
      }
      const [existing] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.source, "pinterest"), eq(posts.sourceId, id)))
        .limit(1);
      const existingFlag = Boolean(existing);
      items.push({
        ok: true,
        pinId: id,
        pin,
        existing: existingFlag,
        colors: await colorsForPinMedia(pin, existingFlag),
      });
    } catch (err) {
      items.push({
        ok: false,
        pinId: id,
        input: id,
        error: err instanceof Error ? err.message : "Fetch failed.",
      });
    }
  }

  return { ok: true, items };
}

export type PublishPinInput = {
  pinId: string;
  title: string;
  caption: string;
  categoryIds: string[];
  mediaColors?: PaletteColor[][];
  autoplayInFeed?: boolean;
  featured?: boolean;
  hiddenGem?: boolean;
  interaction?: string | null;
};

export async function publishPinPost(
  input: PublishPinInput,
): Promise<PublishResult> {
  await requireAdmin();
  const id = parsePinId(input.pinId) ?? input.pinId.trim();
  if (!id || !/^\d{5,25}$/.test(id)) {
    return { ok: false, error: "Invalid pin id." };
  }

  try {
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.source, "pinterest"), eq(posts.sourceId, id)))
      .limit(1);
    if (existing) {
      return { ok: false, error: "This pin is already published." };
    }

    const pin = await fetchPin(id);
    if (pin.media.length === 0) {
      return { ok: false, error: "This pin has no downloadable media." };
    }

    let [creator] = await db
      .select()
      .from(creators)
      .where(
        and(
          eq(creators.source, "pinterest"),
          eq(creators.sourceId, pin.creator.sourceId),
        ),
      )
      .limit(1);

    if (!creator) {
      const creatorId = randomUUID();
      let avatarUrl: string | null = null;
      if (pin.creator.avatarUrl) {
        avatarUrl = await uploadAvatar(
          pin.creator.avatarUrl,
          `pinterest/creators/${pin.creator.sourceId}`,
        );
      }
      const [inserted] = await db
        .insert(creators)
        .values({
          id: creatorId,
          source: "pinterest",
          sourceId: pin.creator.sourceId,
          username: pin.creator.username,
          displayName: pin.creator.displayName,
          avatarUrl,
          profileUrl: pin.creator.profileUrl,
        })
        .returning();
      creator = inserted;
    }

    const postId = randomUUID();
    const keyBase = `pinterest/posts/${id}`;

    const processedMedia = await Promise.all(
      pin.media.map(async (m, i) => {
        const keyPrefix = `${keyBase}/${i}`;
        const edited = input.mediaColors?.[i];
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
            colors: edited ? sanitizePalette(edited) : p.colors,
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
          colors: edited ? sanitizePalette(edited) : p.colors,
        };
      }),
    );

    const imageCount = processedMedia.filter((m) => m.kind === "image").length;
    const hasVideo = processedMedia.some(
      (m) => m.kind === "video" || m.kind === "gif",
    );
    const publishedAt = pin.createdAt ? new Date(pin.createdAt) : new Date();

    await db.transaction(async (tx) => {
      await tx.insert(posts).values({
        id: postId,
        source: "pinterest",
        sourceId: id,
        sourceUrl: pin.url,
        creatorId: creator!.id,
        title: input.title.trim() || null,
        caption: input.caption.trim() || pin.text || null,
        rawText: pin.text || null,
        providerMeta: pin.raw as object,
        publishedAt,
        hasVideo,
        autoplayInFeed: hasVideo && (input.autoplayInFeed ?? false),
        imageCount,
        published: true,
        featured: input.featured ?? false,
        hiddenGem: input.hiddenGem ?? false,
        interaction: input.interaction?.trim() || null,
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
    console.error("[publishPinPost] failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Publish failed.",
    };
  }
}

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
        // Prefer the admin-reviewed palette; fall back to fresh extraction.
        const edited = input.mediaColors?.[i];
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
            colors: edited ? sanitizePalette(edited) : p.colors,
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
          colors: edited ? sanitizePalette(edited) : p.colors,
        };
      }),
    );

    const imageCount = processedMedia.filter((m) => m.kind === "image").length;
    const hasVideo = processedMedia.some((m) => m.kind === "video" || m.kind === "gif");
    const publishedAt = tweet.createdAt ? new Date(tweet.createdAt) : new Date();
    const raw = tweet.raw as { full_text?: string; text?: string } | null;
    const rawText = raw?.full_text ?? raw?.text ?? tweet.text;

    await db.transaction(async (tx) => {
      await tx.insert(posts).values({
        id: postId,
        source: "x",
        sourceId: id,
        sourceUrl: tweet.url,
        creatorId: creator!.id,
        title: input.title.trim() || null,
        // Strip trailing media t.co even if the admin left syndication's append in.
        caption:
          cleanCaptionForDisplay(input.caption.trim()) || tweet.text || null,
        rawText,
        providerMeta: tweet.raw as object,
        publishedAt,
        hasVideo,
        // Only autoplay when there's actually a video to play.
        autoplayInFeed: hasVideo && (input.autoplayInFeed ?? false),
        imageCount,
        published: true,
        featured: input.featured ?? false,
        hiddenGem: input.hiddenGem ?? false,
        interaction: input.interaction?.trim() || null,
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
