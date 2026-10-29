"use server";

import {
  getSearchFacets,
  getFacetPreview,
  getTextPreview,
} from "./search-facets";
import { getPostsByFacet, searchDesigns, type PostListItem } from "./queries";
import { interpretationChips } from "@/lib/jev/interpret-search";
import {
  EMPTY_FACETS,
  type ActiveSearch,
  type FacetKind,
  type FacetPreview,
  type SearchFacets,
} from "./search-filter";

/** Browse vocabulary + counts. Cached server-side; the palette fetches it once. */
export async function loadSearchFacetsAction(): Promise<SearchFacets> {
  try {
    return await getSearchFacets();
  } catch {
    return EMPTY_FACETS;
  }
}

/** Thumbnails for the palette's preview pane. */
export async function loadSearchPreviewAction(
  target:
    | { kind: "text"; query: string }
    | { kind: FacetKind; slug: string },
): Promise<FacetPreview> {
  try {
    return target.kind === "text"
      ? await getTextPreview(target.query)
      : await getFacetPreview(target.kind, target.slug);
  } catch {
    return { total: 0, tiles: [] };
  }
}

export type SearchResult = {
  posts: PostListItem[];
  /** Extra vocabulary Jev resolved the phrase to — shown next to the count. */
  chips: string[];
};

/**
 * Commit a search. Tag picks go straight to the index; a typed phrase takes the
 * Jev-assisted path so "dark fintech dashboard" still lands somewhere sensible.
 */
export async function runSearchAction(
  search: ActiveSearch,
): Promise<SearchResult> {
  try {
    if (search.kind !== "text") {
      return {
        posts: await getPostsByFacet(search.kind, search.slug, { limit: 120 }),
        chips: [],
      };
    }
    const q = search.query.trim();
    if (!q) return { posts: [], chips: [] };
    const { posts, interpretation } = await searchDesigns(q, { limit: 120 });
    return {
      posts,
      chips: interpretationChips(interpretation).map((c) => c.label),
    };
  } catch {
    return { posts: [], chips: [] };
  }
}
