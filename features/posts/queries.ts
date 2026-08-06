import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, creators, media, postCategories, posts } from "@/lib/db/schema";

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

export async function getRecentPosts(opts: { limit?: number; offset?: number } = {}) {
  const limit = opts.limit ?? 60;
  const offset = opts.offset ?? 0;
  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(limit)
    .offset(offset);
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

/** Max squared RGB distance for a palette colour to count as a match (~48/channel). */
const COLOR_MATCH_SQ = 48 * 48;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/**
 * Find published posts whose media palette contains a colour close to EVERY
 * requested colour ("designs using these colours"). Ranked by how tightly the
 * palette matches — the sum, across requested colours, of the nearest palette
 * colour's distance. Matches against the per-media `colors` jsonb populated at
 * upload time.
 */
export async function searchPostsByColors(
  hexes: string[],
  opts: { limit?: number } = {},
) {
  const targets = hexes.map(hexToRgb).filter((c): c is { r: number; g: number; b: number } => c !== null);
  if (targets.length === 0) return [];
  const limit = opts.limit ?? 120;

  // Per requested colour: the closest palette colour across the post's media.
  const dist = (t: { r: number; g: number; b: number }) => sql`
    (select min(
       power((c->>'r')::int - ${t.r}, 2) +
       power((c->>'g')::int - ${t.g}, 2) +
       power((c->>'b')::int - ${t.b}, 2))
     from ${media} m, jsonb_array_elements(m.colors) c
     where m.post_id = p.id)
  `;
  const nearest = targets.map(dist);
  // AND semantics: every requested colour must have a match within threshold.
  const conditions = sql.join(
    nearest.map((d) => sql`coalesce(${d}, 1e9) <= ${COLOR_MATCH_SQ}`),
    sql` and `,
  );
  // Relevance: total closeness across all requested colours (smaller = better).
  const score = sql.join(
    nearest.map((d) => sql`coalesce(${d}, 1e9)`),
    sql` + `,
  );

  // Rank ids via raw SQL, then hydrate full rows through the typed select so
  // column names map to camelCase (raw `db.execute` returns snake_case).
  const ranked = await db.execute<{ id: string }>(sql`
    select p.id from ${posts} p
    where p.published = true and ${conditions}
    order by (${score}) asc, p.published_at desc nulls last
    limit ${limit}
  `);
  const ids = (ranked as unknown as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];

  const rows = await db.select().from(posts).where(inArray(posts.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
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
