import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories,
  creators,
  industries,
  media,
  postCategories,
  postIndustries,
  postPublicColumns,
  postStyles,
  posts,
  styles,
  type PostPublic,
} from "@/lib/db/schema";
import {
  interpretSearchQuery,
  type SearchInterpretation,
} from "@/lib/jev/interpret-search";
import {
  bestPaletteDistance,
  hexToHsl,
  type Hsl,
} from "@/lib/media/color-utils";
import type { PaletteColor } from "@/lib/media/colors";
import { cleanCaptionForDisplay } from "@/lib/providers/tweet/clean-caption";
import { searchSimilarHits } from "@/lib/db/similar-posts";
import { facetPostIds } from "./search-facets";
import type { FacetKind } from "./search-filter";

export type FeedSort = "recent" | "oldest" | "featured" | "hidden_gems";

export type PostListItem = {
  id: string;
  title: string | null;
  caption: string | null;
  sourceUrl: string;
  source:
    | "x"
    | "threads"
    | "instagram"
    | "pinterest"
    | "linkedin"
    | "dribbble"
    | "behance";
  hasVideo: boolean;
  autoplayInFeed: boolean;
  imageCount: number;
  publishedAt: Date | null;
  /** Interaction type for the side panel (e.g. MicroInteraction). */
  interaction: string | null;
  /** Dominant colours across media — shown as copyable swatches. */
  colors: string[];
  creator: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
    /** Where the creator lives on the source network — we link straight out to it. */
    profileUrl: string | null;
  };
  thumbnail: {
    url: string;
    width: number | null;
    height: number | null;
  } | null;
  /** All media for the post, ordered by position — used by the lightbox carousel. */
  images: {
    /** Media row id — the key the copy proxy resolves. */
    id: string | null;
    url: string;
    posterUrl: string | null;
    kind: "image" | "video" | "gif";
    width: number | null;
    height: number | null;
  }[];
  categories: { slug: string; name: string }[];
};

/**
 * Creators have no page of their own — every avatar/name links straight out to the
 * source network, falling back to the X handle when no profile URL was captured.
 */
export function creatorProfileUrl(
  creator: { profileUrl?: string | null; username?: string | null } | null | undefined,
): string | null {
  if (creator?.profileUrl) return creator.profileUrl;
  return creator?.username ? `https://x.com/${creator.username}` : null;
}

/** Small shape shared by list/grid views. */
async function loadPostsWithRelations(postRows: PostPublic[]) {
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
    const colorSet = new Set<string>();
    for (const m of postMedia) {
      for (const swatch of m.colors ?? []) {
        if (swatch?.hex) colorSet.add(swatch.hex.toLowerCase());
        if (colorSet.size >= 6) break;
      }
      if (colorSet.size >= 6) break;
    }
    return {
      id: p.id,
      title: p.title,
      // Strip trailing media t.co so SSR/client alt text and captions match.
      caption: p.caption ? cleanCaptionForDisplay(p.caption) || null : null,
      sourceUrl: p.sourceUrl,
      source: p.source,
      hasVideo: p.hasVideo,
      autoplayInFeed: p.autoplayInFeed,
      imageCount: p.imageCount,
      publishedAt: p.publishedAt,
      interaction: p.interaction ?? null,
      colors: Array.from(colorSet),
      creator: {
        username: c?.username ?? "",
        displayName: c?.displayName ?? "",
        avatarUrl: c?.avatarUrl ?? null,
        profileUrl: creatorProfileUrl(c),
      },
      thumbnail: thumb
        ? {
            url: thumb.thumbnailUrl ?? thumb.mediumUrl ?? thumb.originalUrl,
            width: thumb.width,
            height: thumb.height,
          }
        : null,
      images: postMedia.map((m) => ({
        id: m.id,
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
    sort?: FeedSort;
  } = {},
) {
  const limit = opts.limit ?? 24;
  const offset = opts.offset ?? 0;
  const sort = opts.sort ?? "recent";
  const sortDir = sort === "oldest" ? asc : desc;
  // Gallery "Recently" = newest additions first (createdAt), not the source
  // tweet/pin date — otherwise old X posts land at the bottom when published.
  const order = [sortDir(posts.createdAt), sortDir(posts.publishedAt)] as const;

  const flagFilter =
    sort === "featured"
      ? eq(posts.featured, true)
      : sort === "hidden_gems"
        ? eq(posts.hiddenGem, true)
        : undefined;

  const baseWhere = flagFilter
    ? and(eq(posts.published, true), flagFilter)
    : eq(posts.published, true);

  let rows: PostPublic[];
  if (opts.category && opts.category !== "all") {
    rows = await db
      .select({ post: postPublicColumns })
      .from(posts)
      .innerJoin(postCategories, eq(postCategories.postId, posts.id))
      .innerJoin(categories, eq(categories.id, postCategories.categoryId))
      .where(and(baseWhere, eq(categories.slug, opts.category)))
      .orderBy(...order)
      .limit(limit)
      .offset(offset)
      .then((r) => r.map((row) => row.post));
  } else {
    rows = await db
      .select(postPublicColumns)
      .from(posts)
      .where(baseWhere)
      .orderBy(...order)
      .limit(limit)
      .offset(offset);
  }
  return loadPostsWithRelations(rows);
}

export async function getPostsByCategory(slug: string, opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 60;
  const rows = await db
    .select({ post: postPublicColumns })
    .from(posts)
    .innerJoin(postCategories, eq(postCategories.postId, posts.id))
    .innerJoin(categories, eq(categories.id, postCategories.categoryId))
    .where(and(eq(categories.slug, slug), eq(posts.published, true)))
    .orderBy(desc(posts.createdAt), desc(posts.publishedAt))
    .limit(limit);
  return loadPostsWithRelations(rows.map((r) => r.post));
}

async function ftsPostIds(query: string, limit: number): Promise<string[]> {
  const idRows = await db.execute<{ id: string }>(sql`
    select p.id from ${posts} p
    inner join ${creators} c on c.id = p.creator_id
    where p.published = true
      and (
        p.search_tsv @@ plainto_tsquery('english', ${query})
        or c.username ilike ${"%" + query + "%"}
        or c.display_name ilike ${"%" + query + "%"}
      )
    order by
      ts_rank_cd(p.search_tsv, plainto_tsquery('english', ${query})) desc,
      p.published_at desc nulls last
    limit ${limit}
  `);
  return asIdList(idRows);
}

function asIdList(result: unknown): string[] {
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && "rows" in result
      ? (result as { rows: { id: string }[] }).rows
      : [];
  return rows.map((r) => r.id);
}

async function idsByCategory(slug: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: posts.id })
    .from(posts)
    .innerJoin(postCategories, eq(postCategories.postId, posts.id))
    .innerJoin(categories, eq(categories.id, postCategories.categoryId))
    .where(and(eq(posts.published, true), eq(categories.slug, slug)))
    .orderBy(desc(posts.createdAt), desc(posts.publishedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

async function idsByStyle(slug: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: posts.id })
    .from(posts)
    .innerJoin(postStyles, eq(postStyles.postId, posts.id))
    .innerJoin(styles, eq(styles.id, postStyles.styleId))
    .where(and(eq(posts.published, true), eq(styles.slug, slug)))
    .orderBy(desc(posts.createdAt), desc(posts.publishedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

async function idsByIndustry(slug: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: posts.id })
    .from(posts)
    .innerJoin(postIndustries, eq(postIndustries.postId, posts.id))
    .innerJoin(industries, eq(industries.id, postIndustries.industryId))
    .where(and(eq(posts.published, true), eq(industries.slug, slug)))
    .orderBy(desc(posts.createdAt), desc(posts.publishedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

async function idsByElement(slug: string, limit: number): Promise<string[]> {
  const idRows = await db.execute<{ id: string }>(sql`
    select p.id
    from ${posts} p
    inner join post_elements pe on pe.post_id = p.id
    inner join elements e on e.id = pe.element_id
    where p.published = true
      and e.slug = ${slug}
    order by p.created_at desc
    limit ${limit}
  `);
  return asIdList(idRows);
}

function intersect(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  const [first, ...rest] = lists;
  if (!first) return [];
  const sets = rest.map((list) => new Set(list));
  return first.filter((id) => sets.every((set) => set.has(id)));
}

function rankMergedIds(opts: {
  hard: string[][];
  boost: Set<string>;
  fts: string[];
  limit: number;
}): string[] {
  const hardIds = opts.hard.length > 0 ? intersect(opts.hard) : [];
  const seen = new Set<string>();
  const ranked: string[] = [];
  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    ranked.push(id);
  };
  for (const id of hardIds) {
    if (opts.boost.has(id)) push(id);
  }
  for (const id of hardIds) push(id);
  for (const id of opts.fts) push(id);
  return ranked.slice(0, opts.limit);
}

export async function searchPosts(query: string, opts: { limit?: number } = {}) {
  const { posts: found } = await searchDesigns(query, opts);
  return found;
}

export async function searchDesigns(
  query: string,
  opts: { limit?: number } = {},
): Promise<{ posts: PostListItem[]; interpretation: SearchInterpretation }> {
  const q = query.trim();
  const empty: SearchInterpretation = {
    query: q,
    intent: "unknown",
    source: "none",
  };
  if (!q) return { posts: [], interpretation: empty };

  const limit = opts.limit ?? 60;
  const interpretation = await interpretSearchQuery(q);
  const fts = await ftsPostIds(q, limit);

  if (interpretation.intent === "creator") {
    const postsFound = await loadPostsByIds(fts.slice(0, limit));
    return { posts: postsFound, interpretation };
  }

  const hardLists: string[][] = [];
  const boost = new Set<string>();
  const pool = Math.max(limit * 4, 240);

  if (interpretation.category) {
    const ids = await idsByCategory(interpretation.category.slug, pool);
    if (ids.length > 0) hardLists.push(ids);
  }
  if (interpretation.element) {
    const ids = await idsByElement(interpretation.element.slug, pool);
    if (ids.length > 0) hardLists.push(ids);
  }
  if (interpretation.style) {
    const styleIds = await idsByStyle(interpretation.style.slug, pool);
    if (styleIds.length > 0) {
      if (hardLists.length === 0) hardLists.push(styleIds);
      else styleIds.forEach((id) => boost.add(id));
    }
  }
  if (interpretation.industry) {
    const industryIds = await idsByIndustry(interpretation.industry.slug, pool);
    if (industryIds.length > 0) {
      if (hardLists.length === 0) hardLists.push(industryIds);
      else industryIds.forEach((id) => boost.add(id));
    }
  }

  const ids = rankMergedIds({
    hard: hardLists,
    boost,
    fts,
    limit,
  });
  return { posts: await loadPostsByIds(ids), interpretation };
}

async function loadPostsByIds(ids: string[]): Promise<PostListItem[]> {
  if (ids.length === 0) return [];
  const postRows = await db
    .select(postPublicColumns)
    .from(posts)
    .where(inArray(posts.id, ids));
  const byId = new Map(postRows.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is PostPublic => Boolean(r));
  return loadPostsWithRelations(ordered);
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

  const postRows = await db
    .select(postPublicColumns)
    .from(posts)
    .where(inArray(posts.id, ids));
  const byId = new Map(postRows.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is PostPublic => Boolean(r));
  return loadPostsWithRelations(ordered);
}

export const getPostById = cache(async (id: string) => {
  const [row] = await db
    .select(postPublicColumns)
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
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
});

/**
 * Full feed-card posts nearest to `postId` — used by the overlay lightbox.
 *
 * Cached for the same hour as the post page's version: the hit search runs a
 * pgvector scan, six metadata reads and a Jev rerank, which is ~2.5s of work to
 * repeat every time someone opens the same design.
 */
export const getSimilarPosts = (postId: string, limit = 12) =>
  unstable_cache(
    () => similarPostsUncached(postId, limit),
    ["overlay-similar-posts-v1", postId, String(limit)],
    { revalidate: 3600 },
  )();

async function similarPostsUncached(postId: string, limit: number) {
  const hits = await searchSimilarHits({ postId, limit });
  if (hits.length === 0) return [];
  const ids = hits.map((h) => h.id);
  const postRows = await db
    .select(postPublicColumns)
    .from(posts)
    .where(inArray(posts.id, ids));
  const byId = new Map(postRows.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is PostPublic => Boolean(r));
  return loadPostsWithRelations(ordered);
}

/**
 * Feed cards for one browse tag (category / element / style / industry).
 * Powers the palette's "show these designs" commit — no Jev hop, since the
 * person picked the tag themselves.
 */
export async function getPostsByFacet(
  kind: FacetKind,
  slug: string,
  opts: { limit?: number } = {},
): Promise<PostListItem[]> {
  const ids = await facetPostIds(kind, slug, opts.limit ?? 120);
  return loadPostsByIds(ids);
}
