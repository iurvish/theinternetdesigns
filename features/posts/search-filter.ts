/**
 * Shared vocabulary for the command-palette search. Deliberately free of any
 * server-only import so the toolbar, the palette, and the server actions can
 * all speak the same shapes.
 */

/** Tag vocabularies a search can resolve to. */
export type FacetKind = "category" | "element" | "style" | "industry";

export const FACET_GROUP_LABELS: Record<FacetKind, string> = {
  category: "Categories",
  element: "Elements",
  style: "Styles",
  industry: "Industries",
};

/** Singular label used in the preview pane's eyebrow. */
export const FACET_KIND_LABELS: Record<FacetKind, string> = {
  category: "Category",
  element: "Element",
  style: "Style",
  industry: "Industry",
};

export type FacetTerm = {
  kind: FacetKind;
  slug: string;
  name: string;
  count: number;
  /** Extra strings the term should match on (element synonyms). */
  aliases: string[];
};

export type SearchFacets = Record<FacetKind, FacetTerm[]>;

export const EMPTY_FACETS: SearchFacets = {
  category: [],
  element: [],
  style: [],
  industry: [],
};

/** Lightweight thumbnail used by the palette's preview pane. */
export type PreviewTile = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
};

export type FacetPreview = {
  total: number;
  tiles: PreviewTile[];
};

/**
 * What the feed is currently filtered by. `text` runs the full (Jev-assisted)
 * search; the tag kinds hit an index directly, which is why they're separate.
 */
export type ActiveSearch =
  | { kind: "text"; query: string; label: string }
  | { kind: FacetKind; slug: string; label: string };

/** Stable identity for a filter — used to tag async results and drop stale ones. */
export function searchKey(search: ActiveSearch | null): string {
  if (!search) return "";
  return search.kind === "text"
    ? `text:${search.query.trim().toLowerCase()}`
    : `${search.kind}:${search.slug}`;
}

/**
 * Elements lead: people arrive looking for a *thing* ("pricing", "navbar"),
 * and categories read as the coarser fallback underneath.
 */
export const FACET_ORDER: FacetKind[] = [
  "element",
  "category",
  "style",
  "industry",
];
