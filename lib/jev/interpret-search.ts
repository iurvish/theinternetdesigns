import { unstable_cache } from "next/cache";
import { asChoice, jevEvaluate, pickChoice } from "./client";
import { matchSearchQuery } from "./match-search";
import {
  CATEGORY_LABELS,
  ELEMENT_LABELS,
  INDUSTRY_LABELS,
  SEARCH_CATEGORIES,
  SEARCH_ELEMENTS,
  SEARCH_INDUSTRIES,
  SEARCH_STYLES,
  STYLE_LABELS,
} from "./taxonomy";

export type SearchInterpretation = {
  query: string;
  intent: "creator" | "design" | "unknown";
  category?: { slug: string; name: string };
  style?: { slug: string; name: string };
  industry?: { slug: string; name: string };
  element?: { slug: string; name: string };
  source: "alias" | "jev" | "mixed" | "none";
};

function labeled(
  slug: string | null | undefined,
  name: string | undefined,
  fallback: Record<string, string>,
): { slug: string; name: string } | undefined {
  if (!slug || slug === "none") return undefined;
  return { slug, name: name || fallback[slug] || slug };
}

async function interpretWithJev(query: string): Promise<SearchInterpretation | null> {
  const result = await jevEvaluate({
    feature: "search",
    state: { query },
    questions: {
      intent: {
        type: "choice",
        instructions:
          "What is this person trying to find on a UI/design inspiration gallery?",
        criteria: {
          design:
            "They want designs, screens, layouts, styles, components, brands, type, or 3D — any gallery topic, not only dashboards.",
          creator:
            "They are looking up a designer, handle, or studio by name.",
          unknown: "Spam, empty, or not a gallery search.",
        },
      },
      category: {
        type: "choice",
        instructions:
          "If they named a gallery category (landing page, logo, mobile, dashboard, 3D, illustration, …), pick it. Otherwise none.",
        criteria: SEARCH_CATEGORIES,
      },
      style: {
        type: "choice",
        instructions: "If they named a visual style, pick it. Otherwise none.",
        criteria: SEARCH_STYLES,
      },
      industry: {
        type: "choice",
        instructions: "If they named an industry or product domain, pick it. Otherwise none.",
        criteria: SEARCH_INDUSTRIES,
      },
      element: {
        type: "choice",
        instructions:
          "If they named a screen, section, or component, pick it. Otherwise none.",
        criteria: SEARCH_ELEMENTS,
      },
    },
  });
  if (!result) return null;

  const intent = asChoice(result.answers.intent)?.choice ?? "unknown";
  if (intent === "creator") {
    return { query, intent: "creator", source: "jev" };
  }

  return {
    query,
    intent: "design",
    category: labeled(pickChoice(asChoice(result.answers.category), 0.5), undefined, CATEGORY_LABELS),
    style: labeled(pickChoice(asChoice(result.answers.style), 0.5), undefined, STYLE_LABELS),
    industry: labeled(pickChoice(asChoice(result.answers.industry), 0.5), undefined, INDUSTRY_LABELS),
    element: labeled(pickChoice(asChoice(result.answers.element), 0.55), undefined, ELEMENT_LABELS),
    source: "jev",
  };
}

export async function interpretSearchQueryUncached(
  query: string,
): Promise<SearchInterpretation> {
  const q = query.trim();
  const live = await matchSearchQuery(q);
  const fromVocab: SearchInterpretation = {
    query: q,
    intent: "design",
    category: live.category
      ? { slug: live.category.slug, name: live.category.name }
      : undefined,
    style: live.style ? { slug: live.style.slug, name: live.style.name } : undefined,
    industry: live.industry
      ? { slug: live.industry.slug, name: live.industry.name }
      : undefined,
    element: live.element
      ? { slug: live.element.slug, name: live.element.name }
      : undefined,
    source: "alias",
  };
  const hasVocab =
    Boolean(fromVocab.category) ||
    Boolean(fromVocab.style) ||
    Boolean(fromVocab.industry) ||
    Boolean(fromVocab.element);

  // Live tags cover every gallery type. Only ask Jev when the query doesn't
  // already map onto the catalog.
  if (hasVocab) return fromVocab;

  const jev = await interpretWithJev(q);
  if (!jev) return { query: q, intent: "unknown", source: "none" };
  return jev;
}

export async function interpretSearchQuery(
  query: string,
): Promise<SearchInterpretation> {
  const key = query.trim().toLowerCase();
  if (!key) {
    return { query, intent: "unknown", source: "none" };
  }
  return unstable_cache(
    () => interpretSearchQueryUncached(query.trim()),
    ["jev-search-v2", key],
    { revalidate: 86400 },
  )();
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
