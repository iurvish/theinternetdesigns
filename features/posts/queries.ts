import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories,
  creators,
  media,
  postCategories,
  posts,
} from "@/lib/db/schema";
import {
  interpretationFromTerms,
  type SearchInterpretation,
} from "@/lib/jev/interpret-search";
import { colorMatchDistance, hexToHsl, type Hsl } from "@/lib/media/color-utils";
import { cleanCaptionForDisplay } from "@/lib/providers/tweet/clean-caption";
import { getCorpusIndex } from "@/lib/corpus";
import { searchCorpus } from "@/lib/corpus/search";
import { similarCorpusPosts } from "@/lib/corpus/similar";
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
 * Every list read on this site is served from the in-memory corpus snapshot
 * (`lib/corpus`) rather than a per-request query. See the note at the top of
 * `lib/corpus/snapshot.ts` for why: round-trips, not query time, were the whole
 * cost here.
 */

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

export async function getRecentPosts(
  opts: {
    limit?: number;
    offset?: number;
    category?: string | null;
    sort?: FeedSort;
  } = {},
): Promise<PostListItem[]> {
  const limit = opts.limit ?? 24;
  const offset = Math.max(0, opts.offset ?? 0);
  const sort = opts.sort ?? "recent";

  try {
    const index = await getCorpusIndex();
    // Gallery "Recently" = newest additions first (createdAt), not the source
    // tweet/pin date — otherwise old X posts land at the bottom when published.
    let order =
      sort === "oldest"
        ? index.oldest
        : sort === "featured"
          ? index.featured
          : sort === "hidden_gems"
            ? index.hiddenGems
            : index.recent;

    if (opts.category && opts.category !== "all") {
      const inCategory = index.byFacet.category.get(opts.category);
      if (!inCategory) return [];
      const allowed = new Set(inCategory);
      order = order.filter((position) => allowed.has(position));
    }

    return order
      .slice(offset, offset + limit)
      .map((position) => index.cards[position]!);
  } catch {
    // The feed is the first thing on the page; a cold or unreachable snapshot
    // falls back to a direct read rather than rendering an empty gallery.
    return feedPageFallback(limit, offset, opts.category ?? null);
  }
}

export async function getPostsByCategory(
  slug: string,
  opts: { limit?: number } = {},
): Promise<PostListItem[]> {
  const index = await getCorpusIndex();
  const positions = index.byFacet.category.get(slug) ?? [];
  return positions
    .slice(0, opts.limit ?? 60)
    .map((position) => index.cards[position]!);
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
  if (!q) {
    return {
      posts: [],
      interpretation: { query: q, intent: "unknown", source: "none" },
    };
  }
  const { resolved, posts: found } = await searchCorpus(q, opts.limit ?? 60);
  return { posts: found, interpretation: interpretationFromTerms(q, resolved) };
}

/**
 * Find published posts whose media palette matches ANY of the requested colours.
 * Uses HSL proximity (hue for chromatic colours, lightness for neutrals) instead
 * of raw RGB distance, so blues find soft UI blues and mid-greys don't pull white.
 *
 * Matching is inclusive: asking for grey + red returns posts using either. Posts
 * that hit more of the requested colours rank above single-colour matches.
 *
 * The palettes are already HSL in the index — this used to read every published
 * post's swatches over the wire and convert ~6,000 of them per request.
 */
export async function searchPostsByColors(
  hexes: string[],
  opts: { limit?: number } = {},
): Promise<PostListItem[]> {
  const targets = hexes.map(hexToHsl).filter((c): c is Hsl => c !== null);
  if (targets.length === 0) return [];
  const limit = opts.limit ?? 120;
  const index = await getCorpusIndex();

  const scored: { position: number; hits: number; score: number }[] = [];
  for (let position = 0; position < index.palettes.length; position++) {
    const palette = index.palettes[position]!;
    if (palette.length === 0) continue;
    let hits = 0;
    let total = 0;
    for (const target of targets) {
      let best: number | null = null;
      for (const swatch of palette) {
        const dist = colorMatchDistance(target, swatch);
        if (dist == null) continue;
        // Slight boost for dominant colours (percent 0–100 → weight 0.75–1.25).
        const weight = 1.25 - Math.min(Math.max(swatch.percent, 0), 100) / 200;
        const scoredDist = dist * weight;
        if (best == null || scoredDist < best) best = scoredDist;
      }
      if (best == null) continue;
      hits++;
      total += best;
    }
    if (hits > 0) scored.push({ position, hits, score: total / hits });
  }

  // More requested colours matched wins; ties break on how close the match is.
  scored.sort((a, b) => b.hits - a.hits || a.score - b.score);
  return scored.slice(0, limit).map((s) => index.cards[s.position]!);
}

/**
 * The detail page's post, creator, media and categories.
 *
 * Served from the corpus when the post is published, which is every post the
 * public site links to — that is the whole page's data in zero round-trips.
 * The direct read stays as the fallback so a draft reached by its URL still
 * renders exactly as it did before.
 */
export const getPostById = cache(async (id: string) => {
  const index = await getCorpusIndex();
  const position = index.positionOf.get(id);
  if (position != null) {
    const post = index.posts[position]!;
    return {
      post: {
        id: post.id,
        title: post.title,
        caption: post.caption,
        sourceUrl: post.sourceUrl,
        source: post.source,
        creatorId: null,
        hasVideo: post.hasVideo,
        imageCount: post.imageCount,
        interaction: post.interaction,
        publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
        createdAt: new Date(post.createdAt),
      },
      creator: {
        username: post.creator.username,
        displayName: post.creator.displayName,
        avatarUrl: post.creator.avatarUrl,
        profileUrl: post.creator.profileUrl,
      },
      media: post.media.map((m) => ({
        id: m.id,
        kind: m.kind,
        originalUrl: m.originalUrl,
        mediumUrl: m.mediumUrl,
        thumbnailUrl: m.thumbnailUrl,
        posterUrl: m.posterUrl,
        width: m.width,
        height: m.height,
        colors: m.colors,
      })),
      categories: post.categories,
    };
  }
  return getPostByIdUncached(id);
});

async function getPostByIdUncached(id: string) {
  const [row] = await db
    .select({
      id: posts.id,
      title: posts.title,
      caption: posts.caption,
      sourceUrl: posts.sourceUrl,
      source: posts.source,
      creatorId: posts.creatorId,
      hasVideo: posts.hasVideo,
      imageCount: posts.imageCount,
      interaction: posts.interaction,
      publishedAt: posts.publishedAt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  if (!row) return null;
  const [creator, mediaRows, catRows] = await Promise.all([
    db.select().from(creators).where(eq(creators.id, row.creatorId)).limit(1),
    db.select().from(media).where(eq(media.postId, id)).orderBy(media.position),
    db
      .select({ slug: categories.slug, name: categories.name })
      .from(postCategories)
      .innerJoin(categories, eq(categories.id, postCategories.categoryId))
      .where(eq(postCategories.postId, id)),
  ]);
  const c = creator[0];
  if (!c) return null;
  return {
    post: row,
    creator: {
      username: c.username,
      displayName: c.displayName,
      avatarUrl: c.avatarUrl,
      profileUrl: c.profileUrl,
    },
    media: mediaRows.map((m) => ({
      id: m.id,
      kind: m.kind,
      originalUrl: m.originalUrl,
      mediumUrl: m.mediumUrl,
      thumbnailUrl: m.thumbnailUrl,
      posterUrl: m.posterUrl,
      width: m.width,
      height: m.height,
      colors: m.colors ?? [],
    })),
    categories: catRows,
  };
}

/** Full feed-card posts nearest to `postId` — used by the overlay lightbox. */
export async function getSimilarPosts(
  postId: string,
  limit = 12,
): Promise<PostListItem[]> {
  const { index, hits } = await similarCorpusPosts(postId, limit);
  return hits.map((hit) => index.cards[hit.position]!);
}

/**
 * Feed cards for one browse tag (category / element / style / industry).
 * Powers the palette's "show these designs" commit.
 */
export async function getPostsByFacet(
  kind: FacetKind,
  slug: string,
  opts: { limit?: number } = {},
): Promise<PostListItem[]> {
  const index = await getCorpusIndex();
  const positions = index.byFacet[kind].get(slug) ?? [];
  return positions
    .slice(0, opts.limit ?? 120)
    .map((position) => index.cards[position]!);
}

type FallbackRow = {
  id: string;
  title: string | null;
  caption: string | null;
  sourceUrl: string;
  source: PostListItem["source"];
  hasVideo: boolean;
  autoplayInFeed: boolean;
  imageCount: number;
  publishedAt: string | null;
  interaction: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  thumbUrl: string | null;
  thumbWidth: number | null;
  thumbHeight: number | null;
};

/** Minimal newest-first page, for when the snapshot isn't available. */
async function feedPageFallback(
  limit: number,
  offset: number,
  category: string | null,
): Promise<PostListItem[]> {
  const categoryFilter =
    category && category !== "all"
      ? sql`and exists (
          select 1 from ${postCategories} pc
          join ${categories} c on c.id = pc.category_id
          where pc.post_id = p.id and c.slug = ${category}
        )`
      : sql``;

  const result = await db.execute(sql`
    select
      p.id, p.title, p.caption, p.source_url as "sourceUrl", p.source,
      p.has_video as "hasVideo", p.autoplay_in_feed as "autoplayInFeed",
      p.image_count as "imageCount", p.published_at as "publishedAt",
      p.interaction,
      cr.username, cr.display_name as "displayName",
      cr.avatar_url as "avatarUrl", cr.profile_url as "profileUrl",
      m.thumb_url as "thumbUrl", m.width as "thumbWidth", m.height as "thumbHeight"
    from ${posts} p
    join ${creators} cr on cr.id = p.creator_id
    left join lateral (
      select coalesce(mm.thumbnail_url, mm.medium_url, mm.original_url) as thumb_url,
             mm.width, mm.height
      from ${media} mm where mm.post_id = p.id
      order by mm.position asc limit 1
    ) m on true
    where p.published = true
    ${categoryFilter}
    order by p.created_at desc, p.published_at desc nulls last
    limit ${limit} offset ${offset}
  `);

  const raw: unknown = result;
  const rows: FallbackRow[] = Array.isArray(raw)
    ? (raw as FallbackRow[])
    : (((raw as { rows?: FallbackRow[] }).rows) ?? []);

  return rows.map<PostListItem>((row) => ({
    id: row.id,
    title: row.title,
    caption: row.caption ? cleanCaptionForDisplay(row.caption) || null : null,
    sourceUrl: row.sourceUrl,
    source: row.source,
    hasVideo: Boolean(row.hasVideo),
    autoplayInFeed: Boolean(row.autoplayInFeed),
    imageCount: Number(row.imageCount) || 0,
    publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
    interaction: row.interaction,
    colors: [],
    creator: {
      username: row.username ?? "",
      displayName: row.displayName ?? "",
      avatarUrl: row.avatarUrl ?? null,
      profileUrl: creatorProfileUrl({
        profileUrl: row.profileUrl,
        username: row.username,
      }),
    },
    thumbnail: row.thumbUrl
      ? { url: row.thumbUrl, width: row.thumbWidth, height: row.thumbHeight }
      : null,
    images: row.thumbUrl
      ? [
          {
            id: null,
            url: row.thumbUrl,
            posterUrl: null,
            kind: "image",
            width: row.thumbWidth,
            height: row.thumbHeight,
          },
        ]
      : [],
    categories: [],
  }));
}
