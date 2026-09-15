import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories,
  creators,
  industries,
  media as mediaTable,
  postCategories,
  postIndustries,
  postStyles,
  posts,
  styles,
} from "@/lib/db/schema";

export type SimilarPostItem = {
  id: string;
  title: string | null;
  thumbUrl: string | null;
  thumbWidth: number | null;
  thumbHeight: number | null;
  creator: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  similarity: number;
};

export type FindSimilarPostsInput = {
  postId: string;
  limit?: number;
};

export type SimilarHit = {
  id: string;
  title: string | null;
  creatorId: string;
  similarity: number;
};

const VECTOR_POOL = 40;
const LEXICAL_POOL = 24;
/** Below this, cosine is "vaguely a UI screenshot" — category becomes a gate. */
const WEAK_BEST_COSINE = 0.55;
const GENERIC_ELEMENTS = new Set([
  "button",
  "card",
  "avatar",
]);

/** Caption words that describe a UI pattern, plus close neighbors. */
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

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "this",
  "that",
  "just",
  "one",
  "new",
  "my",
  "our",
  "you",
  "your",
  "its",
  "it",
  "is",
  "are",
  "was",
  "be",
  "by",
  "as",
  "into",
  "over",
  "more",
  "about",
  "looking",
  "closer",
  "take",
  "taking",
  "look",
  "lets",
  "let",
  "can",
  "best",
  "love",
  "like",
  "week",
  "latest",
  "using",
  "built",
  "made",
  "work",
  "design",
  "designs",
]);

type SlugBag = {
  categories: string[];
  elements: string[];
  styles: string[];
  industries: string[];
  aspect: number | null;
  haystack: string;
};

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function expandQueryTerms(tokens: string[]): string[] {
  const terms = new Set<string>();
  for (const token of tokens) {
    terms.add(token);
    const synonyms = PATTERN_SYNONYMS[token];
    if (synonyms) {
      for (const s of synonyms) terms.add(s);
    }
  }
  return [...terms];
}

function toTsQuery(terms: string[]): string {
  return [...new Set(terms)]
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 3)
    .slice(0, 12)
    .join(" | ");
}

function countHits(haystack: string, terms: string[]): number {
  if (!haystack || terms.length === 0) return 0;
  const words = new Set(tokenize(haystack));
  let hits = 0;
  for (const term of terms) {
    if (words.has(term)) hits += 1;
  }
  return hits;
}

function overlap(a: string[], b: string[]): string[] {
  if (a.length === 0 || b.length === 0) return [];
  const other = new Set(b);
  return a.filter((x) => other.has(x));
}

function inferredInputFamily(tokens: string[], elements: string[]): boolean {
  if (elements.some((e) => INPUT_FAMILY.includes(e))) return true;
  return tokens.some((t) =>
    ["composer", "prompt", "chat", "input", "search"].includes(t),
  );
}

function aspectOf(width: number | null, height: number | null): number | null {
  if (!width || !height || height === 0) return null;
  return width / height;
}

function emptyBag(): SlugBag {
  return {
    categories: [],
    elements: [],
    styles: [],
    industries: [],
    aspect: null,
    haystack: "",
  };
}

async function loadSlugBags(
  postIds: string[],
): Promise<Map<string, SlugBag>> {
  const bags = new Map<string, SlugBag>();
  if (postIds.length === 0) return bags;
  for (const id of postIds) bags.set(id, emptyBag());

  const [catRows, styleRows, industryRows, elementRows, mediaRows, textRows] =
    await Promise.all([
      db
        .select({
          postId: postCategories.postId,
          slug: categories.slug,
        })
        .from(postCategories)
        .innerJoin(categories, eq(categories.id, postCategories.categoryId))
        .where(inArray(postCategories.postId, postIds)),
      db
        .select({
          postId: postStyles.postId,
          slug: styles.slug,
        })
        .from(postStyles)
        .innerJoin(styles, eq(styles.id, postStyles.styleId))
        .where(inArray(postStyles.postId, postIds)),
      db
        .select({
          postId: postIndustries.postId,
          slug: industries.slug,
        })
        .from(postIndustries)
        .innerJoin(industries, eq(industries.id, postIndustries.industryId))
        .where(inArray(postIndustries.postId, postIds)),
      db.execute<{ postId: string; slug: string }>(sql`
        select pe.post_id as "postId", e.slug
        from post_elements pe
        join elements e on e.id = pe.element_id
        where pe.post_id in (${sql.join(
          postIds.map((id) => sql`${id}`),
          sql`, `,
        )})
      `),
      db
        .select({
          postId: mediaTable.postId,
          width: mediaTable.width,
          height: mediaTable.height,
        })
        .from(mediaTable)
        .where(
          and(inArray(mediaTable.postId, postIds), eq(mediaTable.position, 0)),
        ),
      db
        .select({
          id: posts.id,
          title: posts.title,
          caption: posts.caption,
        })
        .from(posts)
        .where(inArray(posts.id, postIds)),
    ]);

  const push = (postId: string, key: keyof Pick<SlugBag, "categories" | "elements" | "styles" | "industries">, slug: string) => {
    const bag = bags.get(postId);
    if (!bag) return;
    bag[key].push(slug);
  };

  for (const row of catRows) push(row.postId, "categories", row.slug);
  for (const row of styleRows) push(row.postId, "styles", row.slug);
  for (const row of industryRows) push(row.postId, "industries", row.slug);
  for (const row of asRows<{ postId: string; slug: string }>(elementRows)) {
    push(row.postId, "elements", row.slug);
  }
  for (const row of mediaRows) {
    const bag = bags.get(row.postId);
    if (bag) bag.aspect = aspectOf(row.width, row.height);
  }
  for (const row of textRows) {
    const bag = bags.get(row.id);
    if (bag) {
      bag.haystack = `${row.title ?? ""} ${row.caption ?? ""}`.trim();
    }
  }

  return bags;
}

function scoreCandidate(opts: {
  cosine: number;
  target: SlugBag;
  candidate: SlugBag;
  queryTerms: string[];
  sourceTokens: string[];
  weakCorpus: boolean;
}): { score: number; tokenHits: number; sameCategory: boolean; keep: boolean } {
  const sharedCats = overlap(opts.target.categories, opts.candidate.categories);
  const sameCategory = sharedCats.length > 0;
  const categoryMismatch =
    opts.target.categories.length > 0 &&
    opts.candidate.categories.length > 0 &&
    !sameCategory;
  const specificElems = overlap(
    opts.target.elements.filter((e) => !GENERIC_ELEMENTS.has(e)),
    opts.candidate.elements.filter((e) => !GENERIC_ELEMENTS.has(e)),
  );
  const sharedStyles = overlap(opts.target.styles, opts.candidate.styles);
  const sharedIndustries = overlap(
    opts.target.industries,
    opts.candidate.industries,
  );
  const tokenHits = countHits(opts.candidate.haystack, opts.queryTerms);
  const sourceHits = countHits(opts.candidate.haystack, opts.sourceTokens);
  const familyMatch =
    inferredInputFamily(opts.sourceTokens, opts.target.elements) &&
    opts.candidate.elements.some((e) => INPUT_FAMILY.includes(e));

  let visual = opts.cosine;
  if (sameCategory && tokenHits > 0) visual = Math.max(visual, 0.5);
  if (sameCategory && specificElems.length > 0) {
    visual = Math.max(visual, 0.46);
  }

  let score = visual;
  if (sameCategory) score += 0.12;
  if (categoryMismatch && opts.weakCorpus) score -= 0.18;
  score += Math.min(2, specificElems.length) * 0.1;
  score += Math.min(2, sharedStyles.length) * 0.04;
  if (sharedIndustries.length > 0) score += 0.04;
  score += Math.min(2, tokenHits) * 0.14;
  if (familyMatch) score += 0.08;

  if (opts.target.aspect && opts.candidate.aspect) {
    const ratio = Math.abs(Math.log(opts.candidate.aspect / opts.target.aspect));
    score -= Math.min(0.1, ratio * 0.12);
  }

  // Weak embeddings cluster by "screenshot vibe". Don't leak other categories
  // unless the caption actually shares a source token (composer, boardui, …).
  const keep = opts.weakCorpus
    ? sameCategory || sourceHits > 0
    : !categoryMismatch || sourceHits > 0 || opts.cosine >= 0.62;

  return { score, tokenHits, sameCategory, keep };
}

/**
 * Rank similar published posts from stored embeddings, then rerank with
 * category / element / caption signals. Public site never generates embeddings.
 */
export async function searchSimilarHits(
  input: FindSimilarPostsInput,
): Promise<SimilarHit[]> {
  const { postId, limit = 12 } = input;
  const safeLimit = Math.min(Math.max(1, limit), 50);

  const [target] = await db
    .select({
      id: posts.id,
      embedding: posts.embedding,
      title: posts.title,
      caption: posts.caption,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!target) return [];

  const hasEmbedding = Boolean(target.embedding && target.embedding.length > 0);
  if (!hasEmbedding) return [];

  const sourceTokens = tokenize(`${target.title ?? ""} ${target.caption ?? ""}`);
  const queryTerms = expandQueryTerms(sourceTokens);
  const tsQuery = toTsQuery(queryTerms);

  const vectorParam = JSON.stringify(target.embedding);
  const distanceSql = sql<number>`(${posts.embedding}::halfvec(2048) <=> ${vectorParam}::halfvec(2048))`;
  const vectorPromise = db
    .select({
      id: posts.id,
      title: posts.title,
      creatorId: posts.creatorId,
      distance: distanceSql,
    })
    .from(posts)
    .where(
      and(
        eq(posts.published, true),
        isNotNull(posts.embedding),
        ne(posts.id, postId),
      ),
    )
    .orderBy(asc(distanceSql))
    .limit(VECTOR_POOL);

  const lexicalPromise = tsQuery
    ? db.execute<{
        id: string;
        title: string | null;
        creatorId: string;
      }>(sql`
        select p.id, p.title, p.creator_id as "creatorId"
        from ${posts} p
        where p.published = true
          and p.id <> ${postId}
          and p.search_tsv @@ to_tsquery('english', ${tsQuery})
        order by ts_rank_cd(p.search_tsv, to_tsquery('english', ${tsQuery})) desc
        limit ${LEXICAL_POOL}
      `)
    : Promise.resolve([]);

  const [vectorRows, lexicalRows] = await Promise.all([
    vectorPromise,
    lexicalPromise,
  ]);

  type Cand = {
    id: string;
    title: string | null;
    creatorId: string;
    cosine: number;
  };
  const byId = new Map<string, Cand>();

  for (const row of vectorRows) {
    const d =
      typeof row.distance === "number" ? row.distance : Number(row.distance) || 0;
    byId.set(row.id, {
      id: row.id,
      title: row.title,
      creatorId: row.creatorId,
      cosine: Math.max(0, Math.min(1, 1 - d)),
    });
  }

  for (const row of asRows<{
    id: string;
    title: string | null;
    creatorId: string;
  }>(lexicalRows)) {
    const existing = byId.get(row.id);
    if (existing) continue;
    byId.set(row.id, {
      id: row.id,
      title: row.title,
      creatorId: row.creatorId,
      cosine: 0,
    });
  }

  if (byId.size === 0) return [];

  const candidateIds = [...byId.keys()];
  const bags = await loadSlugBags([postId, ...candidateIds]);
  const targetBag = bags.get(postId) ?? emptyBag();
  if (!targetBag.haystack) {
    targetBag.haystack = `${target.title ?? ""} ${target.caption ?? ""}`.trim();
  }

  const bestCosine = Math.max(
    0,
    ...[...byId.values()].map((c) => c.cosine),
  );
  const weakCorpus = !hasEmbedding || bestCosine < WEAK_BEST_COSINE;

  const ranked = [...byId.values()]
    .map((cand) => {
      const scored = scoreCandidate({
        cosine: cand.cosine,
        target: targetBag,
        candidate: bags.get(cand.id) ?? emptyBag(),
        queryTerms,
        sourceTokens,
        weakCorpus,
      });
      return { ...cand, ...scored };
    })
    .filter((row) => row.keep)
    .sort((a, b) => b.score - a.score || b.cosine - a.cosine);

  const chosen = weakCorpus
    ? (() => {
        const withText = ranked.filter((row) => row.tokenHits > 0);
        const withoutText = ranked.filter((row) => row.tokenHits === 0);
        const fillerSlots = Math.max(0, Math.min(6, safeLimit - withText.length));
        return [...withText, ...withoutText.slice(0, fillerSlots)].slice(
          0,
          safeLimit,
        );
      })()
    : ranked.slice(0, safeLimit);

  return chosen.map((row) => ({
    id: row.id,
    title: row.title,
    creatorId: row.creatorId,
    similarity: Math.max(0, Math.min(1, row.score)),
  }));
}

/**
 * Nearest published posts after embedding + metadata rerank.
 * Public site never generates embeddings — hide when there is no signal.
 */
export async function findSimilarPosts(
  input: FindSimilarPostsInput,
): Promise<SimilarPostItem[]> {
  const matchedRows = await searchSimilarHits(input);

  if (matchedRows.length === 0) {
    return [];
  }

  const postIds = matchedRows.map((r) => r.id);
  const creatorIds = Array.from(new Set(matchedRows.map((r) => r.creatorId)));

  const [mediaRows, creatorRows] = await Promise.all([
    db
      .select({
        postId: mediaTable.postId,
        thumbnailUrl: mediaTable.thumbnailUrl,
        mediumUrl: mediaTable.mediumUrl,
        originalUrl: mediaTable.originalUrl,
        posterUrl: mediaTable.posterUrl,
        width: mediaTable.width,
        height: mediaTable.height,
      })
      .from(mediaTable)
      .where(
        and(inArray(mediaTable.postId, postIds), eq(mediaTable.position, 0)),
      ),
    db
      .select({
        id: creators.id,
        username: creators.username,
        displayName: creators.displayName,
        avatarUrl: creators.avatarUrl,
      })
      .from(creators)
      .where(inArray(creators.id, creatorIds)),
  ]);

  const mediaByPost = new Map(mediaRows.map((m) => [m.postId, m]));
  const creatorById = new Map(creatorRows.map((c) => [c.id, c]));

  return matchedRows.map((row) => {
    const thumb = mediaByPost.get(row.id);
    const creator = creatorById.get(row.creatorId);

    return {
      id: row.id,
      title: row.title,
      thumbUrl: thumb
        ? (thumb.thumbnailUrl ??
          thumb.posterUrl ??
          thumb.mediumUrl ??
          thumb.originalUrl)
        : null,
      thumbWidth: thumb?.width ?? null,
      thumbHeight: thumb?.height ?? null,
      creator: {
        username: creator?.username ?? "",
        displayName: creator?.displayName ?? "",
        avatarUrl: creator?.avatarUrl ?? null,
      },
      similarity: row.similarity,
    };
  });
}

export const getCachedSimilarPosts = cache((postId: string, limit = 12) =>
  unstable_cache(
    async () => findSimilarPosts({ postId, limit }),
    ["similar-posts-v3", postId, String(limit)],
    { revalidate: 3600 },
  )(),
);
