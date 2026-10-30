import "server-only";
import { getCorpusIndex } from "@/lib/corpus";
import { resolveQueryWith, rankSearch } from "@/lib/corpus/search";
import {
  EMPTY_FACETS,
  type FacetKind,
  type FacetPreview,
  type FacetTerm,
  type SearchFacets,
} from "./search-filter";

/**
 * Browse vocabulary and preview thumbnails for the search palette.
 *
 * Both come off the in-memory index. The previews matter most: the palette asks
 * for one on every row the person arrows past, and each used to be a cached
 * round-trip — fast on a repeat, 100ms+ the first time a tag was ever hovered.
 */

const PREVIEW_TILES = 6;

export async function getSearchFacets(): Promise<SearchFacets> {
  try {
    const index = await getCorpusIndex();
    const pick = (kind: FacetKind): FacetTerm[] =>
      index.facets[kind].map((term) => ({
        kind,
        slug: term.slug,
        name: term.name,
        count: term.count,
        aliases: term.aliases,
      }));
    return {
      category: pick("category"),
      element: pick("element"),
      style: pick("style"),
      industry: pick("industry"),
    };
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
  const index = await getCorpusIndex();
  return (index.byFacet[kind].get(slug) ?? [])
    .slice(0, limit)
    .map((position) => index.posts[position]!.id);
}

function toPreview(
  index: Awaited<ReturnType<typeof getCorpusIndex>>,
  positions: number[],
): FacetPreview {
  return {
    total: positions.length,
    tiles: positions.slice(0, PREVIEW_TILES).flatMap((position) => {
      const post = index.posts[position]!;
      const thumb = post.media[0];
      return thumb
        ? [
            {
              id: post.id,
              url: thumb.thumbUrl,
              width: thumb.width,
              height: thumb.height,
            },
          ]
        : [];
    }),
  };
}

/** Thumbnails + total for one tag — what the palette's right pane shows. */
export async function getFacetPreview(
  kind: FacetKind,
  slug: string,
): Promise<FacetPreview> {
  const index = await getCorpusIndex();
  return toPreview(index, index.byFacet[kind].get(slug) ?? []);
}

/**
 * Free-text preview. Runs the same ranking the committed search does, so what
 * the preview shows and what the grid paints can no longer disagree — the old
 * split (FTS here, Jev-assisted search on commit) is why "dark dashboard"
 * previewed as empty and then returned results.
 */
export async function getTextPreview(query: string): Promise<FacetPreview> {
  const q = query.trim();
  if (!q) return { total: 0, tiles: [] };
  const index = await getCorpusIndex();
  const resolved = resolveQueryWith(index, q);
  const hits = rankSearch(index, resolved, 60);
  return toPreview(
    index,
    hits.map((h) => h.position),
  );
}
