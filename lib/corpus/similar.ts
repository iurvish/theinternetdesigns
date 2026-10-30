import "server-only";
import { getCorpusIndex, type CorpusIndex } from "./index";
import type { CorpusPost } from "./snapshot";

/**
 * "More designs like this", answered from the in-memory index.
 *
 * The ranking signals are the ones the SQL+LLM version used — cosine from the
 * stored embedding, shared category, shared specific elements, shared style and
 * industry, caption word overlap, and aspect-ratio similarity. What's gone is
 * the cost of collecting them: the 2048-dim embedding no longer round-trips
 * through Node (~50KB and ~600ms per lookup for a scan Postgres does in 4ms),
 * the six metadata reads are already in memory, and the Jev rerank is dropped.
 *
 * Dropping the rerank also fixes a result-quality regression: it kept only
 * candidates scoring >= 0.85, which routinely cut a full 12-card grid down to
 * five or seven, so the strip looked half-empty on perfectly good matches.
 */

/** Below this, cosine is "vaguely a UI screenshot" — category becomes a gate. */
const WEAK_BEST_COSINE = 0.55;

/** Elements too common to count as a shared pattern. */
const GENERIC_ELEMENTS = new Set(["button", "card", "avatar"]);

/** Caption words that describe a UI pattern, plus close neighbours. */
const PATTERN_SYNONYMS: Record<string, string[]> = {
  composer: ["prompt", "chat", "input"],
  prompt: ["composer", "chat", "input"],
  chat: ["composer", "prompt", "input"],
  input: ["composer", "prompt", "search"],
  search: ["input", "command"],
  command: ["search", "input", "palette"],
  dashboard: ["analytics", "admin", "chart"],
  sidebar: ["navigation", "nav"],
  landing: ["hero", "marketing"],
  onboarding: ["welcome", "empty"],
};

const INPUT_FAMILY = [
  "chat-input",
  "input-field",
  "search-bar",
  "command-palette",
  "file-upload",
  "rich-text-editor",
  "form",
];

/** Lexical candidates pulled in beside the vector neighbours. */
const LEXICAL_POOL = 24;

function overlap(a: string[], b: string[]): string[] {
  if (a.length === 0 || b.length === 0) return [];
  const other = new Set(b);
  return a.filter((x) => other.has(x));
}

function countHits(words: Set<string>, terms: string[]): number {
  let hits = 0;
  for (const term of terms) if (words.has(term)) hits += 1;
  return hits;
}

function expandTerms(tokens: string[]): string[] {
  const terms = new Set<string>();
  for (const token of tokens) {
    terms.add(token);
    for (const s of PATTERN_SYNONYMS[token] ?? []) terms.add(s);
  }
  return [...terms];
}

function inferredInputFamily(tokens: string[], elements: string[]): boolean {
  if (elements.some((e) => INPUT_FAMILY.includes(e))) return true;
  return tokens.some((t) =>
    ["composer", "prompt", "chat", "input", "search"].includes(t),
  );
}

type Scored = {
  position: number;
  cosine: number;
  score: number;
  tokenHits: number;
  keep: boolean;
};

function scoreCandidate(opts: {
  cosine: number;
  target: CorpusPost;
  targetAspect: number | null;
  candidate: CorpusPost;
  candidateAspect: number | null;
  candidateWords: Set<string>;
  queryTerms: string[];
  sourceTokens: string[];
  weakCorpus: boolean;
}): { score: number; tokenHits: number; keep: boolean } {
  const targetCats = opts.target.categories.map((c) => c.slug);
  const candidateCats = opts.candidate.categories.map((c) => c.slug);
  const sameCategory = overlap(targetCats, candidateCats).length > 0;
  const categoryMismatch =
    targetCats.length > 0 && candidateCats.length > 0 && !sameCategory;

  const specificElems = overlap(
    opts.target.elements.filter((e) => !GENERIC_ELEMENTS.has(e)),
    opts.candidate.elements.filter((e) => !GENERIC_ELEMENTS.has(e)),
  );
  const sharedStyles = overlap(opts.target.styles, opts.candidate.styles);
  const sharedIndustries = overlap(
    opts.target.industries,
    opts.candidate.industries,
  );
  const tokenHits = countHits(opts.candidateWords, opts.queryTerms);
  const sourceHits = countHits(opts.candidateWords, opts.sourceTokens);
  const familyMatch =
    inferredInputFamily(opts.sourceTokens, opts.target.elements) &&
    opts.candidate.elements.some((e) => INPUT_FAMILY.includes(e));

  let visual = opts.cosine;
  if (sameCategory && tokenHits > 0) visual = Math.max(visual, 0.5);
  if (sameCategory && specificElems.length > 0) visual = Math.max(visual, 0.46);

  let score = visual;
  if (sameCategory) score += 0.12;
  if (categoryMismatch && opts.weakCorpus) score -= 0.18;
  score += Math.min(2, specificElems.length) * 0.1;
  score += Math.min(2, sharedStyles.length) * 0.04;
  if (sharedIndustries.length > 0) score += 0.04;
  score += Math.min(2, tokenHits) * 0.14;
  if (familyMatch) score += 0.08;

  if (opts.targetAspect && opts.candidateAspect) {
    const ratio = Math.abs(Math.log(opts.candidateAspect / opts.targetAspect));
    score -= Math.min(0.1, ratio * 0.12);
  }

  // Weak embeddings cluster by "screenshot vibe". Don't leak other categories
  // unless the caption actually shares a source token (composer, boardui, …).
  const keep = opts.weakCorpus
    ? sameCategory || sourceHits > 0
    : !categoryMismatch || sourceHits > 0 || opts.cosine >= 0.62;

  return { score, tokenHits, keep };
}

export type SimilarRanked = { position: number; similarity: number };

export function rankSimilar(
  index: CorpusIndex,
  postId: string,
  limit: number,
): SimilarRanked[] {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const targetPosition = index.positionOf.get(postId);
  if (targetPosition == null) return [];
  const target = index.posts[targetPosition]!;
  // Matching the old contract: no embedding means no similarity signal, and the
  // public site never generates one. Only ~200 of ~650 posts have one.
  if (!target.hasEmbedding) return [];

  const sourceTokens = [...(index.textTokens[targetPosition] ?? [])];
  const queryTerms = expandTerms(sourceTokens);

  const cosineByPosition = new Map<number, number>();
  for (const neighbor of index.neighbors.get(postId) ?? []) {
    const position = index.positionOf.get(neighbor.id);
    if (position != null) cosineByPosition.set(position, neighbor.cosine);
  }

  // Lexical pool beside the vector pool, ranked by how many expanded caption
  // terms a post shares. This replaces the `to_tsquery` OR-scan.
  if (queryTerms.length > 0) {
    const lexical = new Map<number, number>();
    for (const term of queryTerms) {
      for (const position of index.postings.get(term) ?? []) {
        if (position === targetPosition) continue;
        lexical.set(position, (lexical.get(position) ?? 0) + 1);
      }
    }
    const ordered = [...lexical]
      .sort((a, b) => b[1] - a[1])
      .slice(0, LEXICAL_POOL);
    for (const [position] of ordered) {
      if (!cosineByPosition.has(position)) cosineByPosition.set(position, 0);
    }
  }

  if (cosineByPosition.size === 0) return [];

  const bestCosine = Math.max(0, ...cosineByPosition.values());
  const weakCorpus = bestCosine < WEAK_BEST_COSINE;
  const targetAspect = index.aspects[targetPosition] ?? null;

  const scored: Scored[] = [];
  for (const [position, cosine] of cosineByPosition) {
    const candidate = index.posts[position]!;
    const result = scoreCandidate({
      cosine,
      target,
      targetAspect,
      candidate,
      candidateAspect: index.aspects[position] ?? null,
      candidateWords: index.textTokens[position] ?? new Set(),
      queryTerms,
      sourceTokens,
      weakCorpus,
    });
    scored.push({ position, cosine, ...result });
  }

  const ranked = scored
    .filter((row) => row.keep)
    .sort((a, b) => b.score - a.score || b.cosine - a.cosine);

  // On a weak-cosine post, caption matches lead and the rest fill in behind
  // them. The filler used to stop at six, which left the strip visibly
  // half-empty on most posts; everything here already passed the `keep` gate,
  // so on a weak corpus it is same-category by construction and safe to show.
  const chosen = weakCorpus
    ? (() => {
        const withText = ranked.filter((row) => row.tokenHits > 0);
        const withoutText = ranked.filter((row) => row.tokenHits === 0);
        const fillerSlots = Math.max(0, safeLimit - withText.length);
        return [...withText, ...withoutText.slice(0, fillerSlots)].slice(
          0,
          safeLimit,
        );
      })()
    : ranked.slice(0, safeLimit);

  return chosen.map((row) => ({
    position: row.position,
    similarity: Math.max(0, Math.min(1, row.score)),
  }));
}

export async function similarCorpusPosts(postId: string, limit = 12) {
  const index = await getCorpusIndex();
  return {
    index,
    hits: rankSimilar(index, postId, limit),
  };
}
