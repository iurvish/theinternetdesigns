import type { FacetKind } from "@/features/posts/search-filter";

/**
 * What a search query resolved to, and the chips the UI shows beside the count.
 *
 * This used to call Jev. It no longer does: the local vocabulary covers every
 * live tag, and the measured LLM hop cost 400–800ms on exactly the queries it
 * was supposed to rescue — while still answering "no tag" often enough to leave
 * real searches empty. `lib/corpus/search.ts` resolves the same thing from
 * memory in microseconds. The type and `interpretationChips` stay because the
 * search page and the feed's result header both render them.
 */

export type SearchInterpretation = {
  query: string;
  intent: "creator" | "design" | "unknown";
  category?: { slug: string; name: string };
  style?: { slug: string; name: string };
  industry?: { slug: string; name: string };
  element?: { slug: string; name: string };
  source: "alias" | "vocabulary" | "none";
};

type ResolvedLike = {
  terms: { kind: FacetKind; slug: string; name: string }[];
  creator: string | null;
};

/** Fold the resolver's terms into the shape the pages already render. */
export function interpretationFromTerms(
  query: string,
  resolved: ResolvedLike,
): SearchInterpretation {
  if (resolved.creator) {
    return { query, intent: "creator", source: "vocabulary" };
  }
  const interpretation: SearchInterpretation = {
    query,
    intent: resolved.terms.length > 0 ? "design" : "unknown",
    source: resolved.terms.length > 0 ? "vocabulary" : "none",
  };
  for (const term of resolved.terms) {
    const labelled = { slug: term.slug, name: term.name };
    if (term.kind === "category") interpretation.category = labelled;
    if (term.kind === "style") interpretation.style = labelled;
    if (term.kind === "industry") interpretation.industry = labelled;
    if (term.kind === "element") interpretation.element = labelled;
  }
  return interpretation;
}

export function interpretationChips(interp: SearchInterpretation): {
  href?: string;
  label: string;
}[] {
  const chips: { href?: string; label: string }[] = [];
  if (interp.category) {
    chips.push({
      href: `/category/${interp.category.slug}`,
      label: interp.category.name,
    });
  }
  if (interp.style) chips.push({ label: interp.style.name });
  if (interp.industry) chips.push({ label: interp.industry.name });
  if (interp.element) chips.push({ label: interp.element.name });
  return chips;
}
