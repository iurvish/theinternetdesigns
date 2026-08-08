import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, creators, media, postCategories, posts } from "@/lib/db/schema";
import {
  bestPaletteDistance,
  hexToHsl,
  type Hsl,
} from "@/lib/media/color-utils";
import type { PaletteColor } from "@/lib/media/colors";

export type PostListItem = {
  id: string;
  title: string | null;
  caption: string | null;
  sourceUrl: string;
  hasVideo: boolean;
  autoplayInFeed: boolean;
  imageCount: number;
  publishedAt: Date | null;
  creator: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  thumbnail: {
    url: string;
    width: number | null;
    height: number | null;
  } | null;
  /** All media for the post, ordered by position — used by the lightbox carousel. */
  images: {
    url: string;
    posterUrl: string | null;
    kind: "image" | "video" | "gif";
    width: number | null;
    height: number | null;
  }[];
  categories: { slug: string; name: string }[];
};

/** Small shape shared by list/grid views. */
async function loadPostsWithRelations(postRows: (typeof posts.$inferSelect)[]) {
  if (postRows.length === 0) return [];
  const ids = postRows.map((p) => p.id);
  const creatorIds = Array.from(new Set(postRows.map((p) => p.creatorId)));

  const [creatorRows, mediaRows, catRows] = await Promise.all([
    db.select().from(creators).where(inArray(creators.id, creatorIds)),
    db
      .select()
      .from(media)
      .where(inArray(media.postId, ids))
      .orderBy(media.position),
    db
      .select({
        postId: postCategories.postId,
        slug: categories.slug,
        name: categories.name,
      })
      .from(postCategories)
      .innerJoin(categories, eq(categories.id, postCategories.categoryId))
      .where(inArray(postCategories.postId, ids)),
  ]);

  const creatorById = new Map(creatorRows.map((c) => [c.id, c]));
  const mediaByPost = new Map<string, typeof mediaRows>();
  for (const m of mediaRows) {
    const arr = mediaByPost.get(m.postId) ?? [];
    arr.push(m);
    mediaByPost.set(m.postId, arr);
  }
  const catsByPost = new Map<string, { slug: string; name: string }[]>();
  for (const row of catRows) {
    const arr = catsByPost.get(row.postId) ?? [];
    arr.push({ slug: row.slug, name: row.name });
    catsByPost.set(row.postId, arr);
  }

  return postRows.map<PostListItem>((p) => {
    const c = creatorById.get(p.creatorId);
    const postMedia = mediaByPost.get(p.id) ?? [];
    const thumb = postMedia[0];
    return {
      id: p.id,
      title: p.title,
      caption: p.caption,
      sourceUrl: p.sourceUrl,
      hasVideo: p.hasVideo,
      autoplayInFeed: p.autoplayInFeed,
      imageCount: p.imageCount,
      publishedAt: p.publishedAt,
      creator: {
        username: c?.username ?? "",
        displayName: c?.displayName ?? "",
        avatarUrl: c?.avatarUrl ?? null,
      },
      thumbnail: thumb
        ? {
            url: thumb.thumbnailUrl ?? thumb.mediumUrl ?? thumb.originalUrl,
            width: thumb.width,
            height: thumb.height,
          }
        : null,
      images: postMedia.map((m) => ({
        url: m.mediumUrl ?? m.originalUrl,
        posterUrl: m.posterUrl ?? m.thumbnailUrl,
        kind: m.kind,
        width: m.width,
        height: m.height,
      })),
      categories: catsByPost.get(p.id) ?? [],
    };
  });
}

export async function getRecentPosts(
  opts: {
    limit?: number;
    offset?: number;
    category?: string | null;
    sort?: "recent" | "oldest";
  } = {},
) {
  const limit = opts.limit ?? 24;
  const offset = opts.offset ?? 0;
  const sortDir = opts.sort === "oldest" ? asc : desc;

  let rows: (typeof posts.$inferSelect)[];
  if (opts.category && opts.category !== "all") {
    rows = await db
      .select({ post: posts })
      .from(posts)
      .innerJoin(postCategories, eq(postCategories.postId, posts.id))
      .innerJoin(categories, eq(categories.id, postCategories.categoryId))
      .where(and(eq(posts.published, true), eq(categories.slug, opts.category)))
      .orderBy(sortDir(posts.publishedAt), sortDir(posts.createdAt))
      .limit(limit)
      .offset(offset)
      .then((r) => r.map((row) => row.post));
  } else {
    rows = await db
      .select()
      .from(posts)
      .where(eq(posts.published, true))
      .orderBy(sortDir(posts.publishedAt), sortDir(posts.createdAt))
      .limit(limit)
      .offset(offset);
  }
  return loadPostsWithRelations(rows);
}

export async function getPostsByCategory(slug: string, opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 60;
  const rows = await db
    .select({ post: posts })
    .from(posts)
    .innerJoin(postCategories, eq(postCategories.postId, posts.id))
    .innerJoin(categories, eq(categories.id, postCategories.categoryId))
    .where(and(eq(categories.slug, slug), eq(posts.published, true)))
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(limit);
  return loadPostsWithRelations(rows.map((r) => r.post));
}

export async function getPostsByCreator(username: string, opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 60;
  const rows = await db
    .select({ post: posts })
    .from(posts)
    .innerJoin(creators, eq(creators.id, posts.creatorId))
    .where(and(eq(creators.username, username), eq(posts.published, true)))
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(limit);
  return loadPostsWithRelations(rows.map((r) => r.post));
}

export async function searchPosts(query: string, opts: { limit?: number } = {}) {
  const q = query.trim();
  if (!q) return [];
  const limit = opts.limit ?? 60;
  // Postgres FTS via the generated search_tsv column plus creator name trigram match.
  const rows = await db.execute<typeof posts.$inferSelect>(sql`
    select p.* from ${posts} p
    inner join ${creators} c on c.id = p.creator_id
    where p.published = true
      and (
        p.search_tsv @@ plainto_tsquery('english', ${q})
        or c.username ilike ${"%" + q + "%"}
        or c.display_name ilike ${"%" + q + "%"}
      )
    order by
      ts_rank_cd(p.search_tsv, plainto_tsquery('english', ${q})) desc,
      p.published_at desc nulls last
    limit ${limit}
  `);
  return loadPostsWithRelations(rows as unknown as (typeof posts.$inferSelect)[]);
}

/**
 * Find published posts whose media palette matches ANY of the requested colours.
 * Uses HSL proximity (hue for chromatic colours, lightness for neutrals) instead
 * of raw RGB distance, so blues find soft UI blues and mid-greys don't pull white.
 *
 * Matching is inclusive: asking for grey + red returns posts using either. Posts
 * that hit more of the requested colours rank above single-colour matches.
 */
export async function searchPostsByColors(
  hexes: string[],
  opts: { limit?: number } = {},
) {
  const targets = hexes
    .map(hexToHsl)
    .filter((c): c is Hsl => c !== null);
  if (targets.length === 0) return [];
  const limit = opts.limit ?? 120;

  // Pull every published post's palette swatches — small jsonb payloads, scored in
  // JS so we can use proper HSL matching (SQL RGB distance was too crude).
  const rows = await db.execute<{
    id: string;
    colors: PaletteColor[] | null;
  }>(sql`
    select p.id, m.colors
    from ${posts} p
    inner join ${media} m on m.post_id = p.id
    where p.published = true
  `);

  const palettes = new Map<string, PaletteColor[]>();
  for (const row of rows as unknown as { id: string; colors: PaletteColor[] | null }[]) {
    const existing = palettes.get(row.id) ?? [];
    if (Array.isArray(row.colors)) existing.push(...row.colors);
    palettes.set(row.id, existing);
  }

  const scored: { id: string; hits: number; score: number }[] = [];
  for (const [id, palette] of palettes) {
    if (palette.length === 0) continue;
    let hits = 0;
    let total = 0;
    for (const target of targets) {
      const d = bestPaletteDistance(target, palette);
      if (d == null) continue;
      hits++;
      total += d;
    }
    if (hits > 0) scored.push({ id, hits, score: total / hits });
  }

  // More requested colours matched wins; ties break on how close the match is.
  scored.sort((a, b) => (b.hits - a.hits) || (a.score - b.score));
  const ids = scored.slice(0, limit).map((s) => s.id);
  if (ids.length === 0) return [];

  const postRows = await db.select().from(posts).where(inArray(posts.id, ids));
  const byId = new Map(postRows.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is typeof posts.$inferSelect => Boolean(r));
  return loadPostsWithRelations(ordered);
}

export async function getPostById(id: string) {
  const [row] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!row) return null;
  const [creator, mediaRows, catRows] = await Promise.all([
    db.select().from(creators).where(eq(creators.id, row.creatorId)).limit(1),
    db
      .select()
      .from(media)
      .where(eq(media.postId, id))
      .orderBy(media.position),
    db
      .select({ slug: categories.slug, name: categories.name })
      .from(postCategories)
      .innerJoin(categories, eq(categories.id, postCategories.categoryId))
      .where(eq(postCategories.postId, id)),
  ]);
  return {
    post: row,
    creator: creator[0] ?? null,
    media: mediaRows,
    categories: catRows,
  };
}
