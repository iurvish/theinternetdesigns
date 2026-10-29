import "server-only";
import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { PUBLIC_CATEGORY_SLUGS } from "@/lib/jev/taxonomy";
import { matchSearchQuery } from "@/lib/jev/match-search";
import {
  EMPTY_FACETS,
  type FacetKind,
  type FacetPreview,
  type FacetTerm,
  type SearchFacets,
} from "./search-filter";

/**
 * Browse vocabulary for the search palette: every tag that has at least one
 * published post, with its post count. The palette filters this list on the
 * client, so one cached round-trip powers every keystroke.
 *
 * `elements` has no Drizzle table (it predates the schema file), so all four
 * vocabularies go through the same identifier-templated SQL rather than three
 * query-builder paths plus one raw one.
 */

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function asAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((a): a is string => typeof a === "string");
}

/** Join-table coordinates per vocabulary — a closed set, never caller-supplied. */
const FACET_TABLES: Record<
  FacetKind,
  { table: string; join: string; fk: string }
> = {
  category: { table: "categories", join: "post_categories", fk: "category_id" },
  element: { table: "elements", join: "post_elements", fk: "element_id" },
  style: { table: "styles", join: "post_styles", fk: "style_id" },
  industry: { table: "industries", join: "post_industries", fk: "industry_id" },
};

/** `… from <vocab> t join <join> j … join posts p` — shared by count and id reads. */
function facetJoin(kind: FacetKind) {
  const { table, join, fk } = FACET_TABLES[kind];
  return sql`
    from posts p
    join ${sql.identifier(join)} j on j.post_id = p.id
    join ${sql.identifier(table)} t on t.id = j.${sql.identifier(fk)}
  `;
}

async function countsFor(kind: FacetKind): Promise<FacetTerm[]> {
  // Only `elements` carries synonyms; the rest match on slug + name alone.
  const aliases = kind === "element" ? sql`t.aliases` : sql`null::jsonb`;
  const rows = asRows<{
    slug: string;
    name: string;
    aliases: unknown;
    n: number;
  }>(
    await db.execute(sql`
      select t.slug, t.name, ${aliases} as aliases, count(*)::int as n
      ${facetJoin(kind)}
      where p.published = true
      group by t.slug, t.name, ${aliases}
      order by n desc, t.name asc
    `),
  );

  const publicCats = new Set<string>(PUBLIC_CATEGORY_SLUGS);
  return rows
    .filter((r) => kind !== "category" || publicCats.has(r.slug))
    .map((r) => ({
      kind,
      slug: r.slug,
      name: r.name,
      count: r.n,
      aliases: asAliases(r.aliases),
    }));
}

async function loadSearchFacetsUncached(): Promise<SearchFacets> {
  const [category, element, style, industry] = await Promise.all([
    countsFor("category"),
    countsFor("element"),
    countsFor("style"),
    countsFor("industry"),
  ]);
  return { category, element, style, industry };
}

export async function getSearchFacets(): Promise<SearchFacets> {
  try {
    return await unstable_cache(loadSearchFacetsUncached, ["search-facets-v1"], {
      revalidate: 300,
    })();
  } catch {
    // The palette is an enhancement — a cold or unreachable DB should never
    // take the toolbar down with it.
    return EMPTY_FACETS;
  }
}

/** Post ids for one tag, newest first. */
export async function facetPostIds(
  kind: FacetKind,
  slug: string,
  limit: number,
): Promise<string[]> {
  const rows = asRows<{ id: string }>(
    await db.execute(sql`
      select p.id
      ${facetJoin(kind)}
      where p.published = true and t.slug = ${slug}
      order by p.created_at desc, p.published_at desc nulls last
      limit ${limit}
    `),
  );
  return rows.map((r) => r.id);
}

const PREVIEW_TILES = 6;

type TileRow = {
  total: number;
  post_id: string;
  thumbnail_url: string | null;
  medium_url: string | null;
  original_url: string | null;
  width: number | null;
  height: number | null;
};

function toPreview(rows: TileRow[]): FacetPreview {
  if (rows.length === 0) return { total: 0, tiles: [] };
  return {
    total: rows[0]!.total,
    tiles: rows.flatMap((r) => {
      const url = r.thumbnail_url ?? r.medium_url ?? r.original_url;
      return url
        ? [{ id: r.post_id, url, width: r.width, height: r.height }]
        : [];
    }),
  };
}

/** First image of each matched post, newest first — `null` when a post has none. */
function firstMediaJoin() {
  return sql`
    left join lateral (
      select mm.thumbnail_url, mm.medium_url, mm.original_url, mm.width, mm.height
      from media mm
      where mm.post_id = top.id
      order by mm.position asc
      limit 1
    ) m on true
  `;
}

async function facetPreviewUncached(
  kind: FacetKind,
  slug: string,
): Promise<FacetPreview> {
  // One round-trip for count + ids + thumbnails. Three separate queries against
  // a pooled remote Postgres cost ~3× the latency for the same answer, and this
  // runs on every row the person arrows past.
  const rows = asRows<TileRow>(
    await db.execute(sql`
      with matched as (
        select p.id, p.created_at, p.published_at
        ${facetJoin(kind)}
        where p.published = true and t.slug = ${slug}
      ),
      top as (
        select id,
               row_number() over (
                 order by created_at desc, published_at desc nulls last
               ) as rn
        from matched
        order by created_at desc, published_at desc nulls last
        limit ${PREVIEW_TILES}
      )
      select (select count(*)::int from matched) as total,
             top.id as post_id,
             m.thumbnail_url, m.medium_url, m.original_url, m.width, m.height
      from top
      ${firstMediaJoin()}
      order by top.rn
    `),
  );
  return toPreview(rows);
}

/** Thumbnails + total for one tag — what the palette's right pane shows. */
export async function getFacetPreview(
  kind: FacetKind,
  slug: string,
): Promise<FacetPreview> {
  return unstable_cache(
    () => facetPreviewUncached(kind, slug),
    ["search-preview-facet-v1", kind, slug],
    { revalidate: 300 },
  )();
}

async function textPreviewUncached(q: string): Promise<FacetPreview> {
  const rows = asRows<TileRow>(
    await db.execute(sql`
      with matched as (
        select p.id,
               ts_rank_cd(p.search_tsv, plainto_tsquery('english', ${q})) as rank,
               p.published_at
        from posts p
        inner join creators c on c.id = p.creator_id
        where p.published = true
          and (
            p.search_tsv @@ plainto_tsquery('english', ${q})
            or c.username ilike ${"%" + q + "%"}
            or c.display_name ilike ${"%" + q + "%"}
          )
        order by rank desc, p.published_at desc nulls last
        limit 60
      ),
      top as (
        select id,
               row_number() over (order by rank desc, published_at desc nulls last) as rn
        from matched
        order by rank desc, published_at desc nulls last
        limit ${PREVIEW_TILES}
      )
      select (select count(*)::int from matched) as total,
             top.id as post_id,
             m.thumbnail_url, m.medium_url, m.original_url, m.width, m.height
      from top
      ${firstMediaJoin()}
      order by top.rn
    `),
  );
  return toPreview(rows);
}

/**
 * Free-text preview. Full-text only — no Jev round-trip — because this runs
 * while the person is still typing; the committed search gets the smart path.
 *
 * `plainto_tsquery` ANDs every word, so "dark dashboard" finds nothing even
 * though committing it lands on real results. Falling back to the (local,
 * cached) vocabulary matcher keeps the preview honest about that.
 */
export async function getTextPreview(query: string): Promise<FacetPreview> {
  const q = query.trim();
  if (!q) return { total: 0, tiles: [] };

  const direct = await unstable_cache(
    () => textPreviewUncached(q),
    ["search-preview-text-v1", q.toLowerCase()],
    { revalidate: 300 },
  )();
  if (direct.tiles.length > 0) return direct;

  const match = await matchSearchQuery(q);
  const term = match.category ?? match.element ?? match.style ?? match.industry;
  return term ? getFacetPreview(term.kind, term.slug) : direct;
}
