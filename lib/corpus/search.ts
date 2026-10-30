import "server-only";
import type { FacetKind } from "@/features/posts/search-filter";
import {
  getCorpusIndex,
  normalizePhrase,
  tokenize,
  type CorpusIndex,
  type FacetTermIndex,
} from "./index";

/**
 * Keyword search, answered from the in-memory index.
 *
 * Replaces a chain of one LLM call, a `plainto_tsquery` scan, up to four tag-id
 * reads and two card reads. Two things about the old path were also quality
 * bugs, not just slow ones: `plainto_tsquery` ANDs every word, so "dark fintech
 * dashboard" matched nothing lexically, and a query the vocabulary didn't cover
 * ("glassmorphism") went to the model and came back as no tag at all — zero
 * results for a term that is right there in the captions. Scoring every post
 * directly can't fail that way: a word that matches nothing in the taxonomy
 * still matches title, caption, tag and creator text.
 */

export type ResolvedQuery = {
  query: string;
  /** At most one term per vocabulary, the same shape the old interpreter had. */
  terms: FacetTermIndex[];
  /** Query words left over once tag phrases are claimed. */
  textTokens: string[];
  /** Set when the whole query reads as a creator handle or name. */
  creator: string | null;
};

const FACET_PRIORITY: FacetKind[] = ["category", "element", "style", "industry"];

/**
 * Longest phrase first, one term per vocabulary. Scanning n-grams down from 4
 * is what lets "landing page" beat "page", and claiming a token stops the same
 * word resolving twice.
 */
function resolveTags(
  index: CorpusIndex,
  query: string,
): { terms: FacetTermIndex[]; textTokens: string[] } {
  const normalized = normalizePhrase(query);
  const words = normalized.split(" ").filter(Boolean);
  const usedKind = new Set<FacetKind>();
  const usedWord = new Set<number>();
  const terms: FacetTermIndex[] = [];

  const claim = (phrase: string, start: number, n: number): boolean => {
    const candidates = index.vocabByPhrase.get(phrase);
    if (!candidates || candidates.length === 0) return false;
    const open = candidates.filter((c) => !usedKind.has(c.kind));
    if (open.length === 0) return false;
    let picked: FacetTermIndex | undefined;
    for (const kind of FACET_PRIORITY) {
      picked = open.find((c) => c.kind === kind);
      if (picked) break;
    }
    picked ??= open[0];
    if (!picked) return false;
    usedKind.add(picked.kind);
    terms.push(picked);
    for (let i = 0; i < n; i++) usedWord.add(start + i);
    return true;
  };

  // The whole query as one phrase first — "command palette" is a tag, not two.
  if (words.length > 1) claim(normalized, 0, words.length);
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      let overlaps = false;
      for (let k = 0; k < n; k++) {
        if (usedWord.has(i + k)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      claim(words.slice(i, i + n).join(" "), i, n);
    }
  }

  // Every word still scores as text, including the ones a tag claimed: a post
  // tagged `dashboards` that also says "dashboard" in its title is a better hit.
  return { terms, textTokens: tokenize(query) };
}

/** A query that is really a person: "@handle", a username, or a display name. */
function resolveCreator(index: CorpusIndex, query: string): string | null {
  const needle = normalizePhrase(query).replace(/\s+/g, "");
  if (needle.length < 3) return null;
  let best: { username: string; score: number } | null = null;
  for (const post of index.posts) {
    const username = normalizePhrase(post.creator.username).replace(/\s+/g, "");
    const display = normalizePhrase(post.creator.displayName).replace(/\s+/g, "");
    let score = 0;
    if (username && username === needle) score = 3;
    else if (display && display === needle) score = 3;
    else if (username && username.startsWith(needle)) score = 2;
    else if (display && display.startsWith(needle)) score = 1;
    if (score > 0 && (!best || score > best.score)) {
      best = { username: post.creator.username, score };
    }
  }
  return best && best.score >= 2 ? best.username : null;
}

export async function resolveQuery(query: string): Promise<ResolvedQuery> {
  const index = await getCorpusIndex();
  return resolveQueryWith(index, query);
}

export function resolveQueryWith(
  index: CorpusIndex,
  query: string,
): ResolvedQuery {
  const q = query.trim();
  if (!q) return { query: q, terms: [], textTokens: [], creator: null };
  const { terms, textTokens } = resolveTags(index, q);
  // Only read a query as a creator when it resolved to no tag at all, so
  // "fintech" stays an industry even if someone is called that.
  const creator = terms.length === 0 ? resolveCreator(index, q) : null;
  return { query: q, terms, textTokens, creator };
}

/**
 * Candidate positions for the query's text words: exact token hits plus prefix
 * hits, so a half-typed "glassmo" still finds "glassmorphism". Prefix expansion
 * walks the token keys, which is a few thousand `startsWith` calls — far cheaper
 * than the round-trip it replaces.
 */
function expandTokens(
  index: CorpusIndex,
  tokens: string[],
): { token: string; weight: number }[] {
  const expanded = new Map<string, number>();
  for (const token of tokens) {
    if (index.postings.has(token)) {
      expanded.set(token, Math.max(expanded.get(token) ?? 0, 1));
      continue;
    }
    if (token.length < 3) continue;
    for (const key of index.postings.keys()) {
      if (key.startsWith(token)) {
        expanded.set(key, Math.max(expanded.get(key) ?? 0, 0.5));
      }
    }
  }
  return [...expanded].map(([token, weight]) => ({ token, weight }));
}

export type SearchHit = { position: number; tier: number; score: number };

/**
 * How few tag matches it takes before a tagged query starts showing posts that
 * only matched on words. Roughly one screen of the masonry grid.
 */
const TEXT_SPILL_FLOOR = 24;

/** Sorts last: matched the words but none of the query's tags. */
const TEXT_ONLY_TIER = Number.MAX_SAFE_INTEGER;

/**
 * Tiered ranking rather than one blended number: posts carrying every tag the
 * query resolved to come first, then partial tag matches, then text-only hits.
 * Tiers keep the ordering stable without balancing tag weight against text
 * weight — the tuning that used to send ambiguous queries to the model.
 */
export function rankSearch(
  index: CorpusIndex,
  resolved: ResolvedQuery,
  limit: number,
): SearchHit[] {
  if (resolved.creator) {
    const needle = resolved.creator;
    return index.recent
      .filter((i) => index.posts[i]!.creator.username === needle)
      .slice(0, limit)
      .map((position) => ({ position, tier: 0, score: 1 }));
  }

  const terms = resolved.terms;
  const expanded = expandTokens(index, resolved.textTokens);
  if (terms.length === 0 && expanded.length === 0) return [];

  const candidates = new Set<number>();
  for (const term of terms) {
    for (const position of index.byFacet[term.kind].get(term.slug) ?? []) {
      candidates.add(position);
    }
  }
  for (const { token } of expanded) {
    for (const position of index.postings.get(token) ?? []) {
      candidates.add(position);
    }
  }

  const hits: SearchHit[] = [];
  for (const position of candidates) {
    const post = index.posts[position]!;
    let tagHits = 0;
    for (const term of terms) {
      const slugs =
        term.kind === "category"
          ? post.categories.map((c) => c.slug)
          : term.kind === "style"
            ? post.styles
            : term.kind === "industry"
              ? post.industries
              : post.elements;
      if (slugs.includes(term.slug)) tagHits++;
    }

    const doc = index.docWeights[position]!;
    let text = 0;
    for (const { token, weight } of expanded) {
      const field = doc.tokens.get(token);
      if (!field) continue;
      text += (index.idf.get(token) ?? 1) * field * weight;
    }
    // Length-normalised so a long caption can't outrank a precise title.
    const textScore = text / Math.sqrt(doc.length);

    // Graded by how many of the query's tags the post is missing, so one
    // matching two of three always sorts above one matching one of three. A
    // single blended number can't guarantee that — a strong caption match on
    // one tag was outscoring a post that genuinely carried two.
    const tier = tagHits > 0 ? terms.length - tagHits : TEXT_ONLY_TIER;
    if (tier === TEXT_ONLY_TIER && textScore <= 0) continue;
    hits.push({ position, tier, score: textScore });
  }

  const byRank = (a: SearchHit, b: SearchHit) =>
    b.score - a.score ||
    index.posts[b.position]!.createdAtMs - index.posts[a.position]!.createdAtMs;

  // A query with no tag in it is pure text — every hit is text-only.
  if (terms.length === 0) return hits.sort(byRank).slice(0, limit);

  // Tag matches first, decaying by how many tags they miss. Posts that matched
  // no tag at all only appear when the tagged ones left the grid near-empty:
  // a screen of near-misses reads as a worse answer than a short, right one.
  const tagged = hits
    .filter((h) => h.tier !== TEXT_ONLY_TIER)
    .sort((a, b) => a.tier - b.tier || byRank(a, b));
  const textOnly = hits
    .filter((h) => h.tier === TEXT_ONLY_TIER)
    .sort(byRank);

  const result = tagged.slice(0, limit);
  if (result.length < TEXT_SPILL_FLOOR) {
    result.push(...textOnly.slice(0, TEXT_SPILL_FLOOR - result.length));
  }
  return result;
}

export async function searchCorpus(query: string, limit: number) {
  const index = await getCorpusIndex();
  const resolved = resolveQueryWith(index, query);
  const hits = rankSearch(index, resolved, limit);
  return {
    index,
    resolved,
    posts: hits.map((h) => index.cards[h.position]!),
  };
}
