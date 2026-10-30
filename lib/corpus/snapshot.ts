import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * The whole published gallery, held in memory.
 *
 * Why: this is a read-only site of ~650 posts behind a pooled Postgres in
 * ap-south-1. Measured round-trip is 70–180ms, and both search and
 * similar-designs used to chain five to eight of them (plus an LLM hop), so the
 * floor was 1.3–2.5s no matter how good the SQL was. The entire searchable
 * corpus — cards, media, palettes, all four tag vocabularies, and the nearest
 * neighbours of every embedded post — is about 2MB. Loading it once per server
 * instance and answering from RAM turns every query into a sort over an array:
 * no round-trip, no LLM, sub-millisecond.
 *
 * Writes still belong to the admin app. Nothing here mutates; a snapshot is a
 * read-through cache that ages out, which is why `STALE_AFTER` is the only knob
 * that decides how fast newly published posts show up.
 */

/** Serve a snapshot this old without blocking; refresh behind the request. */
const STALE_AFTER_MS = 60_000;
/** Nearest neighbours kept per embedded post — the grid shows 12 after filtering. */
const NEIGHBORS_PER_POST = 32;

export type CorpusSwatch = {
  hex: string;
  r: number;
  g: number;
  b: number;
  percent: number;
};

export type CorpusMedia = {
  id: string | null;
  /** What the lightbox renders (medium, falling back to original). */
  url: string;
  /** What the feed card renders (thumbnail, falling back down the chain). */
  thumbUrl: string;
  posterUrl: string | null;
  /** Raw columns — the detail page picks between them itself. */
  originalUrl: string;
  mediumUrl: string | null;
  thumbnailUrl: string | null;
  kind: "image" | "video" | "gif";
  width: number | null;
  height: number | null;
  colors: CorpusSwatch[];
};

export type CorpusPost = {
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
  interaction: string | null;
  featured: boolean;
  hiddenGem: boolean;
  hasEmbedding: boolean;
  /** ISO strings, not Dates — a snapshot has to stay JSON-safe. */
  publishedAt: string | null;
  createdAt: string;
  /** Epoch millis, precomputed so feed ordering is a numeric compare. */
  createdAtMs: number;
  publishedAtMs: number;
  creator: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
    profileUrl: string | null;
  };
  media: CorpusMedia[];
  categories: { slug: string; name: string }[];
  styles: string[];
  industries: string[];
  elements: string[];
};

export type CorpusNeighbor = { id: string; cosine: number };

export type CorpusVocabTerm = {
  slug: string;
  name: string;
  aliases: string[];
};

export type CorpusVocab = {
  category: CorpusVocabTerm[];
  element: CorpusVocabTerm[];
  style: CorpusVocabTerm[];
  industry: CorpusVocabTerm[];
};

export type CorpusSnapshot = {
  posts: CorpusPost[];
  /** Flat pairs rather than a Map — see the JSON-safety note above. */
  neighbors: { postId: string; neighbors: CorpusNeighbor[] }[];
  vocab: CorpusVocab;
  /** Content fingerprint — an unchanged one means skip the rebuild. */
  version: string;
  /** When this copy was last confirmed current, not when it was built. */
  builtAt: number;
};

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asSwatches(value: unknown): CorpusSwatch[] {
  if (!Array.isArray(value)) return [];
  const out: CorpusSwatch[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.hex !== "string") continue;
    out.push({
      hex: c.hex.toLowerCase(),
      r: Number(c.r) || 0,
      g: Number(c.g) || 0,
      b: Number(c.b) || 0,
      percent: Number(c.percent) || 0,
    });
  }
  return out;
}

type PostRow = {
  id: string;
  title: string | null;
  caption: string | null;
  sourceUrl: string;
  source: CorpusPost["source"];
  hasVideo: boolean;
  autoplayInFeed: boolean;
  imageCount: number;
  interaction: string | null;
  featured: boolean;
  hiddenGem: boolean;
  hasEmbedding: boolean;
  publishedAt: string | null;
  createdAt: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  media: unknown;
  cats: unknown;
  styles: unknown;
  industries: unknown;
  elements: unknown;
};

/**
 * One statement for every card the site can show. The lateral aggregates keep
 * it to a single round-trip; the older shape fanned out to four more queries
 * per page and still had to re-read `provider_meta` (2KB a post of raw provider
 * payload that nothing on the public site renders).
 */
async function loadPosts(): Promise<CorpusPost[]> {
  const rows = asRows<PostRow>(
    await db.execute(sql`
      select
        p.id,
        p.title,
        p.caption,
        p.source_url as "sourceUrl",
        p.source,
        p.has_video as "hasVideo",
        p.autoplay_in_feed as "autoplayInFeed",
        p.image_count as "imageCount",
        p.interaction,
        p.featured,
        p.hidden_gem as "hiddenGem",
        (p.embedding is not null) as "hasEmbedding",
        p.published_at as "publishedAt",
        p.created_at as "createdAt",
        cr.username,
        cr.display_name as "displayName",
        cr.avatar_url as "avatarUrl",
        cr.profile_url as "profileUrl",
        m.media,
        cats.cats,
        st.styles,
        ind.industries,
        el.elements
      from posts p
      join creators cr on cr.id = p.creator_id
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', mm.id,
            'url', coalesce(mm.medium_url, mm.original_url),
            'thumbUrl', coalesce(mm.thumbnail_url, mm.medium_url, mm.original_url),
            'posterUrl', coalesce(mm.poster_url, mm.thumbnail_url),
            'originalUrl', mm.original_url,
            'mediumUrl', mm.medium_url,
            'thumbnailUrl', mm.thumbnail_url,
            'kind', mm.kind,
            'width', mm.width,
            'height', mm.height,
            'colors', mm.colors
          ) order by mm.position asc
        ) as media
        from media mm
        where mm.post_id = p.id
      ) m on true
      left join lateral (
        select jsonb_agg(
          jsonb_build_object('slug', c.slug, 'name', c.name) order by c.sort_order asc
        ) as cats
        from post_categories pc
        join categories c on c.id = pc.category_id
        where pc.post_id = p.id
      ) cats on true
      left join lateral (
        select jsonb_agg(s.slug) as styles
        from post_styles ps
        join styles s on s.id = ps.style_id
        where ps.post_id = p.id
      ) st on true
      left join lateral (
        select jsonb_agg(i.slug) as industries
        from post_industries pi
        join industries i on i.id = pi.industry_id
        where pi.post_id = p.id
      ) ind on true
      left join lateral (
        select jsonb_agg(e.slug) as elements
        from post_elements pe
        join elements e on e.id = pe.element_id
        where pe.post_id = p.id
      ) el on true
      where p.published = true
    `),
  );

  return rows.map<CorpusPost>((row) => {
    const createdAt = String(row.createdAt);
    const publishedAt = row.publishedAt ? String(row.publishedAt) : null;
    const createdAtMs = Date.parse(createdAt) || 0;
    const mediaRaw = Array.isArray(row.media) ? row.media : [];
    return {
      id: row.id,
      title: row.title,
      caption: row.caption,
      sourceUrl: row.sourceUrl,
      source: row.source,
      hasVideo: Boolean(row.hasVideo),
      autoplayInFeed: Boolean(row.autoplayInFeed),
      imageCount: Number(row.imageCount) || 0,
      interaction: row.interaction ?? null,
      featured: Boolean(row.featured),
      hiddenGem: Boolean(row.hiddenGem),
      hasEmbedding: Boolean(row.hasEmbedding),
      publishedAt,
      createdAt,
      createdAtMs,
      publishedAtMs: publishedAt ? Date.parse(publishedAt) || 0 : 0,
      creator: {
        username: row.username ?? "",
        displayName: row.displayName ?? "",
        avatarUrl: row.avatarUrl ?? null,
        profileUrl: row.profileUrl ?? null,
      },
      media: mediaRaw.flatMap((raw): CorpusMedia[] => {
        if (!raw || typeof raw !== "object") return [];
        const m = raw as Record<string, unknown>;
        const url = typeof m.url === "string" ? m.url : null;
        if (!url) return [];
        const thumbUrl = typeof m.thumbUrl === "string" ? m.thumbUrl : url;
        return [
          {
            id: typeof m.id === "string" ? m.id : null,
            url,
            thumbUrl,
            posterUrl: typeof m.posterUrl === "string" ? m.posterUrl : null,
            originalUrl:
              typeof m.originalUrl === "string" ? m.originalUrl : url,
            mediumUrl: typeof m.mediumUrl === "string" ? m.mediumUrl : null,
            thumbnailUrl:
              typeof m.thumbnailUrl === "string" ? m.thumbnailUrl : null,
            kind:
              m.kind === "video" || m.kind === "gif"
                ? m.kind
                : ("image" as const),
            width: m.width == null ? null : Number(m.width),
            height: m.height == null ? null : Number(m.height),
            colors: asSwatches(m.colors),
          },
        ];
      }),
      categories: Array.isArray(row.cats)
        ? row.cats.flatMap((raw) => {
            if (!raw || typeof raw !== "object") return [];
            const c = raw as Record<string, unknown>;
            return typeof c.slug === "string" && typeof c.name === "string"
              ? [{ slug: c.slug, name: c.name }]
              : [];
          })
        : [],
      styles: asStringList(row.styles),
      industries: asStringList(row.industries),
      elements: asStringList(row.elements),
    };
  });
}

/**
 * Every embedded post's nearest neighbours, computed in one pass.
 *
 * The embedding is a 2048-dim halfvec. Selecting one and sending it back as a
 * query parameter cost ~50KB of wire per lookup and ~600ms, for a scan that
 * Postgres finishes in 4ms — so the vector never leaves the database now.
 *
 * `as materialized` is load-bearing: casting `embedding::halfvec(2048)` inside
 * the join re-casts a 2048-dim vector once per candidate pair, which measured
 * 1554ms server-side. Casting once into a CTE and joining that brings the same
 * ~6,300 pairs down to 72ms.
 */
async function loadNeighbors(): Promise<CorpusSnapshot["neighbors"]> {
  const rows = asRows<{ postId: string; neighborId: string; cosine: string }>(
    await db.execute(sql`
      with vectors as materialized (
        select id, embedding::halfvec(2048) as e
        from posts
        where published = true and embedding is not null
      )
      select
        src.id as "postId",
        n.id as "neighborId",
        round((1 - n.distance)::numeric, 5) as cosine
      from vectors src
      cross join lateral (
        select candidate.id, (candidate.e <=> src.e) as distance
        from vectors candidate
        where candidate.id <> src.id
        order by candidate.e <=> src.e asc
        limit ${NEIGHBORS_PER_POST}
      ) n
    `),
  );

  const grouped = new Map<string, CorpusNeighbor[]>();
  for (const row of rows) {
    const list = grouped.get(row.postId) ?? [];
    list.push({
      id: row.neighborId,
      cosine: Math.max(0, Math.min(1, Number(row.cosine) || 0)),
    });
    grouped.set(row.postId, list);
  }
  return [...grouped].map(([postId, neighbors]) => ({ postId, neighbors }));
}

/** Tag names and element synonyms — what the palette lists and the matcher reads. */
async function loadVocab(): Promise<CorpusVocab> {
  const rows = asRows<{
    kind: keyof CorpusVocab;
    slug: string;
    name: string;
    aliases: unknown;
  }>(
    await db.execute(sql`
      select 'category' as kind, slug, name, null::text[] as aliases from categories
      union all
      select 'style', slug, name, null::text[] from styles
      union all
      select 'industry', slug, name, null::text[] from industries
      union all
      select 'element', slug, name, aliases from elements
    `),
  );

  const vocab: CorpusVocab = {
    category: [],
    element: [],
    style: [],
    industry: [],
  };
  for (const row of rows) {
    const bucket = vocab[row.kind];
    if (!bucket) continue;
    bucket.push({
      slug: row.slug,
      name: row.name,
      aliases: asStringList(row.aliases),
    });
  }
  return vocab;
}

/**
 * A ~100-byte fingerprint of everything the snapshot is built from.
 *
 * This is what keeps the TTL from becoming a bandwidth bill. Rebuilding ~2MB
 * every 60s on a timer would be ~78GB of egress a month per running instance
 * whether or not anything was published — more than the old per-request reads
 * on a quiet site. Polling this instead costs a few hundred bytes a minute, and
 * the full snapshot is only re-fetched when the content actually changed.
 *
 * Counts plus max-timestamps catch publishes, unpublishes, deletions, new
 * media, the colour backfill and re-tagging. An in-place caption edit that
 * leaves `posts.updated_at` untouched is the one thing it would miss.
 */
async function loadVersion(): Promise<string> {
  const rows = asRows<{ version: string }>(
    await db.execute(sql`
      select concat_ws(
        ':',
        (select count(*) from posts where published = true),
        (select max(updated_at) from posts),
        (select max(created_at) from posts),
        (select count(*) from media),
        (select count(*) from media where colors is not null),
        (select max(created_at) from media),
        (select count(*) from post_categories),
        (select count(*) from post_styles),
        (select count(*) from post_industries),
        (select count(*) from post_elements),
        (select count(*) from elements),
        (select count(*) from styles),
        (select count(*) from industries),
        (select count(*) from categories)
      ) as version
    `),
  );
  return rows[0]?.version ?? "";
}

async function build(version: string): Promise<CorpusSnapshot> {
  const [posts, neighbors, vocab] = await Promise.all([
    loadPosts(),
    loadNeighbors(),
    loadVocab(),
  ]);
  return { posts, neighbors, vocab, version, builtAt: Date.now() };
}

let current: CorpusSnapshot | null = null;
let inflight: Promise<CorpusSnapshot> | null = null;

function refresh(): Promise<CorpusSnapshot> {
  inflight ??= (async () => {
    const version = await loadVersion();
    if (current && current.version === version) {
      // Nothing published since the last check. Mark it confirmed and keep the
      // same object, so the derived index is reused rather than rebuilt.
      current.builtAt = Date.now();
      return current;
    }
    const next = await build(version);
    current = next;
    return next;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * The snapshot, rebuilt at most once per `STALE_AFTER_MS`.
 *
 * Once an instance has a snapshot it never blocks on another one: a request
 * past the window gets the existing copy immediately and starts the rebuild
 * behind itself. There is deliberately no hard expiry that would make a request
 * wait — on a gallery this quiet, instances sit idle for long stretches, and
 * the first visitor back should not be the one who pays for the rebuild. The
 * cost of that is a published post taking up to a minute to appear, which is
 * the trade the TTL is making.
 */
export async function getSnapshot(): Promise<CorpusSnapshot> {
  if (!current) return refresh();
  if (Date.now() - current.builtAt >= STALE_AFTER_MS) {
    void refresh().catch(() => {
      /* keep serving the existing snapshot; the next request retries */
    });
  }
  return current;
}

/** Kick off the build without waiting — used to warm a cold instance. */
export function warmSnapshot(): void {
  if (current && Date.now() - current.builtAt < STALE_AFTER_MS) return;
  void refresh().catch(() => {});
}
