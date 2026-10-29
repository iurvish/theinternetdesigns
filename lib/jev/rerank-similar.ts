import { asScore, jevEvaluate } from "./client";

export type SimilarRerankItem = {
  id: string;
  title: string | null;
  caption: string | null;
  categories: string[];
  elements: string[];
  styles: string[];
  score: number;
};

function compact(text: string | null, max = 180): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function candidateKey(id: string): string {
  return `c_${id.replace(/-/g, "").slice(0, 24)}`;
}

/**
 * Score heuristic neighbors against the source post. Fail-open: returns the
 * original order when Jev is unavailable.
 */
export async function rerankSimilarWithJev(opts: {
  source: {
    title: string | null;
    caption: string | null;
    categories: string[];
    elements: string[];
    styles: string[];
  };
  candidates: SimilarRerankItem[];
}): Promise<SimilarRerankItem[]> {
  const pool = opts.candidates.slice(0, 16);
  if (pool.length < 3) return opts.candidates;

  const byKey = new Map<string, SimilarRerankItem>();
  const questions: Record<
    string,
    {
      type: "score";
      instructions: string;
      criteria: string[];
    }
  > = {};

  for (const cand of pool) {
    const key = candidateKey(cand.id);
    byKey.set(key, cand);
    questions[key] = {
      type: "score",
      instructions: `How similar is candidate ${key} to the source design? Same UI pattern / screen beats shared screenshot vibe.`,
      criteria: [
        "Unrelated or a different kind of design",
        "Same medium or vibe only (both UI screenshots, different job)",
        "Same screen type, component, or layout pattern",
        "Near-duplicate: a designer would use this as a reference for the source",
      ],
    };
  }

  const result = await jevEvaluate({
    feature: "similar",
    state: {
      source: {
        title: opts.source.title ?? "",
        caption: compact(opts.source.caption, 400),
        categories: opts.source.categories,
        elements: opts.source.elements,
        styles: opts.source.styles,
      },
      candidates: Object.fromEntries(
        pool.map((c) => [
          candidateKey(c.id),
          {
            title: c.title ?? "",
            caption: compact(c.caption, 220),
            categories: c.categories,
            elements: c.elements,
            styles: c.styles,
          },
        ]),
      ),
    },
    questions,
  });
  if (!result) return opts.candidates;

  const scored = pool.map((cand) => {
    const key = candidateKey(cand.id);
    const jevScore = asScore(result.answers[key])?.score ?? 0;
    return {
      ...cand,
      score: cand.score * 0.35 + (jevScore / 3) * 0.65,
      jevScore,
    };
  });

  const kept = scored
    .filter((row) => (row.jevScore ?? 0) >= 0.85 || scored.length <= 6)
    .sort((a, b) => b.score - a.score);

  const rest = opts.candidates.slice(pool.length);
  const ordered = kept.length > 0 ? kept : scored.sort((a, b) => b.score - a.score);
  return [...ordered, ...rest];
}
