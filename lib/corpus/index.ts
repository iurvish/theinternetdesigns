import "server-only";
import type { PostListItem } from "@/features/posts/queries";
import { cleanCaptionForDisplay } from "@/lib/providers/tweet/clean-caption";
import { rgbToHsl, type Hsl } from "@/lib/media/color-utils";
import { PUBLIC_CATEGORY_SLUGS } from "@/lib/jev/taxonomy";
import type { FacetKind } from "@/features/posts/search-filter";
import {
  getSnapshot,
  type CorpusNeighbor,
  type CorpusPost,
  type CorpusSnapshot,
  type CorpusVocabTerm,
} from "./snapshot";

/**
 * Everything derived from a snapshot, built once per snapshot and then only
 * read: the feed cards in their final wire shape, tag postings, a token index
 * for free-text scoring, palettes already in HSL, and the neighbour lists.
 *
 * All of it is derived rather than stored so the snapshot itself stays plain
 * JSON — `unstable_cache` round-trips its value and would quietly flatten a Map
 * into `{}`, which is exactly how the old alias fast path broke.
 */

/** Words that carry no signal in a gallery query or a design caption. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "with",
  "from", "by", "as", "into", "over", "more", "about", "this", "that", "it",
  "its", "is", "are", "was", "be", "my", "our", "you", "your", "new", "just",
  "one", "best", "cool", "love", "like", "week", "latest", "using", "built",
  "made", "work", "looking", "closer", "take", "taking", "look", "lets", "let",
  "can", "design", "designs", "designer", "ui", "ux", "web", "website", "site",
  "app", "apps", "page", "pages", "screen", "screens",
]);

export type FacetTermIndex = CorpusVocabTerm & { kind: FacetKind; count: number };

export type CorpusIndex = {
  snapshot: CorpusSnapshot;
  posts: CorpusPost[];
  /** Wire-shape cards, aligned by position with `posts`. */
  cards: PostListItem[];
  positionOf: Map<string, number>;
  /** Positions per tag slug, newest first. */
  byFacet: Record<FacetKind, Map<string, number[]>>;
  /** Feed orders, precomputed so pagination is a slice. */
  recent: number[];
  oldest: number[];
  featured: number[];
  hiddenGems: number[];
  byCategoryRecent: Map<string, number[]>;
  /** token -> positions that contain it. */
  postings: Map<string, number[]>;
  /** Per-post token weights (title/tags count more than caption). */
  docWeights: { tokens: Map<string, number>; length: number }[];
  /**
   * Title + caption words only, aligned with `posts`. Kept apart from
   * `docWeights` because similar-designs scoring asks whether two posts share
   * caption language; folding tags in would make every same-tag pair look like
   * a text match too.
   */
  textTokens: Set<string>[];
  /** First media's width/height ratio, or null when unknown. */
  aspects: (number | null)[];
  idf: Map<string, number>;
  /** Palette swatches per post, already converted to HSL. */
  palettes: { h: number; s: number; l: number; percent: number }[][];
  neighbors: Map<string, CorpusNeighbor[]>;
  /** Tag vocabulary with live post counts — what the palette lists. */
  facets: Record<FacetKind, FacetTermIndex[]>;
  /** Normalised phrase -> matching vocabulary terms. */
  vocabByPhrase: Map<string, FacetTermIndex[]>;
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function normalizePhrase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[#@]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function creatorProfileUrl(creator: {
  profileUrl: string | null;
  username: string;
}): string | null {
  if (creator.profileUrl) return creator.profileUrl;
  return creator.username ? `https://x.com/${creator.username}` : null;
}

/** The same card shape `loadPostsWithRelations` used to assemble per request. */
function toCard(post: CorpusPost): PostListItem {
  const thumb = post.media[0];
  const colors: string[] = [];
  const seen = new Set<string>();
  for (const m of post.media) {
    for (const swatch of m.colors) {
      if (seen.has(swatch.hex)) continue;
      seen.add(swatch.hex);
      colors.push(swatch.hex);
      if (colors.length >= 6) break;
    }
    if (colors.length >= 6) break;
  }

  return {
    id: post.id,
    title: post.title,
    caption: post.caption
      ? cleanCaptionForDisplay(post.caption) || null
      : null,
    sourceUrl: post.sourceUrl,
    source: post.source,
    hasVideo: post.hasVideo,
    autoplayInFeed: post.autoplayInFeed,
    imageCount: post.imageCount,
    publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
    interaction: post.interaction,
    colors,
    creator: {
      username: post.creator.username,
      displayName: post.creator.displayName,
      avatarUrl: post.creator.avatarUrl,
      profileUrl: creatorProfileUrl(post.creator),
    },
    thumbnail: thumb
      ? { url: thumb.thumbUrl, width: thumb.width, height: thumb.height }
      : null,
    images: post.media.map((m) => ({
      id: m.id,
      url: m.url,
      posterUrl: m.posterUrl,
      kind: m.kind,
      width: m.width,
      height: m.height,
    })),
    categories: post.categories,
  };
}

/**
 * Field weights for free-text scoring. A query word in a title or a tag is a
 * much stronger signal than the same word buried in a tweet's caption, which is
 * where most of the corpus text lives.
 */
const WEIGHT_TITLE = 3;
const WEIGHT_TAG = 2.5;
const WEIGHT_CREATOR = 2;
const WEIGHT_CAPTION = 1;

function addWeight(into: Map<string, number>, text: string, weight: number) {
  for (const token of tokenize(text)) {
    into.set(token, (into.get(token) ?? 0) + weight);
  }
}

/** Slug, name, and plural/singular variants — how a phrase reaches a tag. */
function phrasesFor(term: CorpusVocabTerm): string[] {
  const keys = new Set<string>();
  const push = (value: string) => {
    const n = normalizePhrase(value);
    if (!n) return;
    keys.add(n);
    if (n.endsWith("s") && n.length > 3) keys.add(n.slice(0, -1));
    else keys.add(`${n}s`);
  };
  push(term.slug);
  push(term.name);
  for (const alias of term.aliases) push(alias);
  return [...keys];
}

/**
 * Hand-written phrasings that no slug or alias covers. These used to be the
 * reason a query needed an LLM at all; as plain synonyms they resolve in
 * microseconds and, unlike the model, never drift between calls.
 */
const SYNONYMS: Record<string, { kind: FacetKind; slug: string }> = {
  // Categories (public slugs only — the legacy rows never reach the palette).
  dashboard: { kind: "category", slug: "dashboards" },
  admin: { kind: "category", slug: "dashboards" },
  analytics: { kind: "category", slug: "dashboards" },
  metrics: { kind: "category", slug: "dashboards" },
  landing: { kind: "category", slug: "landing-page" },
  "landing page": { kind: "category", slug: "landing-page" },
  marketing: { kind: "category", slug: "landing-page" },
  homepage: { kind: "category", slug: "landing-page" },
  mobile: { kind: "category", slug: "mobile-apps" },
  "mobile app": { kind: "category", slug: "mobile-apps" },
  ios: { kind: "category", slug: "mobile-apps" },
  iphone: { kind: "category", slug: "mobile-apps" },
  android: { kind: "category", slug: "mobile-apps" },
  interface: { kind: "category", slug: "interfaces" },
  dashboardui: { kind: "category", slug: "interfaces" },
  interaction: { kind: "category", slug: "interactions" },
  motion: { kind: "category", slug: "interactions" },
  animation: { kind: "category", slug: "interactions" },
  animated: { kind: "category", slug: "interactions" },
  microinteraction: { kind: "category", slug: "interactions" },
  transition: { kind: "category", slug: "interactions" },
  logo: { kind: "category", slug: "logo-design" },
  "logo design": { kind: "category", slug: "logo-design" },
  wordmark: { kind: "category", slug: "logo-design" },
  monogram: { kind: "category", slug: "logo-design" },
  brand: { kind: "category", slug: "brand-design" },
  branding: { kind: "category", slug: "brand-design" },
  identity: { kind: "category", slug: "brand-design" },
  type: { kind: "category", slug: "typography" },
  typeface: { kind: "category", slug: "typography" },
  font: { kind: "category", slug: "typography" },
  lettering: { kind: "category", slug: "typography" },
  kinetic: { kind: "category", slug: "typography" },
  render: { kind: "category", slug: "3d" },
  blender: { kind: "category", slug: "3d" },
  illustration: { kind: "category", slug: "illustration" },
  drawing: { kind: "category", slug: "illustration" },

  // Styles.
  "dark mode": { kind: "style", slug: "dark" },
  "dark ui": { kind: "style", slug: "dark" },
  moody: { kind: "style", slug: "dark" },
  black: { kind: "style", slug: "dark" },
  "light mode": { kind: "style", slug: "light" },
  "light ui": { kind: "style", slug: "light" },
  clean: { kind: "style", slug: "minimal" },
  simple: { kind: "style", slug: "minimal" },
  minimalist: { kind: "style", slug: "minimal" },
  gradients: { kind: "style", slug: "gradient" },
  mesh: { kind: "style", slug: "gradient" },
  colourful: { kind: "style", slug: "colorful" },
  vibrant: { kind: "style", slug: "colorful" },
  "sci fi": { kind: "style", slug: "futuristic" },
  sci: { kind: "style", slug: "futuristic" },
  fun: { kind: "style", slug: "playful" },
  corporate: { kind: "style", slug: "enterprise" },

  // Elements.
  "command palette": { kind: "element", slug: "command-palette" },
  cmdk: { kind: "element", slug: "command-palette" },
  "empty state": { kind: "element", slug: "empty-state" },
  "pricing page": { kind: "element", slug: "pricing" },
  "pricing table": { kind: "element", slug: "pricing" },
  plans: { kind: "element", slug: "pricing" },
  login: { kind: "element", slug: "auth" },
  signin: { kind: "element", slug: "auth" },
  signup: { kind: "element", slug: "auth" },
  modal: { kind: "element", slug: "popup" },
  dialog: { kind: "element", slug: "popup" },
  chat: { kind: "element", slug: "chat-input" },
  composer: { kind: "element", slug: "chat-input" },
  prompt: { kind: "element", slug: "chat-input" },
  kanban: { kind: "element", slug: "kanban-board" },
  nav: { kind: "element", slug: "navbar" },
  navigation: { kind: "element", slug: "navbar" },
  header: { kind: "element", slug: "navbar" },
  glass: { kind: "element", slug: "liquid-glass" },
  glassy: { kind: "element", slug: "liquid-glass" },
  glassmorphism: { kind: "element", slug: "liquid-glass" },
  frosted: { kind: "element", slug: "liquid-glass" },
  "data table": { kind: "element", slug: "table" },
  graph: { kind: "element", slug: "chart" },
  charts: { kind: "element", slug: "chart" },
  upload: { kind: "element", slug: "file-upload" },
  "date picker": { kind: "element", slug: "date-picker" },
  notification: { kind: "element", slug: "toast" },
  cart: { kind: "element", slug: "checkout" },

  // Industries.
  finance: { kind: "industry", slug: "fintech" },
  banking: { kind: "industry", slug: "fintech" },
  payments: { kind: "industry", slug: "fintech" },
  web3: { kind: "industry", slug: "crypto" },
  health: { kind: "industry", slug: "healthcare" },
  medical: { kind: "industry", slug: "healthcare" },
  shop: { kind: "industry", slug: "ecommerce" },
  store: { kind: "industry", slug: "ecommerce" },
  "developer tool": { kind: "industry", slug: "developer-tools" },
  devtool: { kind: "industry", slug: "developer-tools" },
  devtools: { kind: "industry", slug: "developer-tools" },
  "design tool": { kind: "industry", slug: "design-tools" },
  game: { kind: "industry", slug: "gaming" },
  music: { kind: "industry", slug: "music" },
  travel: { kind: "industry", slug: "travel" },
};

const FACET_KINDS: FacetKind[] = ["category", "element", "style", "industry"];

function buildIndex(snapshot: CorpusSnapshot): CorpusIndex {
  const posts = snapshot.posts;
  const cards = posts.map(toCard);
  const positionOf = new Map<string, number>();
  posts.forEach((p, i) => positionOf.set(p.id, i));

  const byFacet: Record<FacetKind, Map<string, number[]>> = {
    category: new Map(),
    element: new Map(),
    style: new Map(),
    industry: new Map(),
  };
  const docWeights: CorpusIndex["docWeights"] = [];
  const postings = new Map<string, number[]>();
  const palettes: CorpusIndex["palettes"] = [];
  const textTokens: Set<string>[] = [];
  const aspects: (number | null)[] = [];

  // Newest first is the gallery's default everywhere, so sort positions once.
  const recent = posts
    .map((_, i) => i)
    .sort((a, b) => {
      const pa = posts[a]!;
      const pb = posts[b]!;
      return pb.createdAtMs - pa.createdAtMs || pb.publishedAtMs - pa.publishedAtMs;
    });

  const slugsOf = (post: CorpusPost, kind: FacetKind): string[] => {
    if (kind === "category") return post.categories.map((c) => c.slug);
    if (kind === "style") return post.styles;
    if (kind === "industry") return post.industries;
    return post.elements;
  };

  for (const position of recent) {
    const post = posts[position]!;
    for (const kind of FACET_KINDS) {
      for (const slug of slugsOf(post, kind)) {
        const list = byFacet[kind].get(slug) ?? [];
        list.push(position);
        byFacet[kind].set(slug, list);
      }
    }
  }

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]!;
    const tokens = new Map<string, number>();
    addWeight(tokens, post.title ?? "", WEIGHT_TITLE);
    addWeight(tokens, post.caption ?? "", WEIGHT_CAPTION);
    addWeight(tokens, post.creator.username, WEIGHT_CREATOR);
    addWeight(tokens, post.creator.displayName, WEIGHT_CREATOR);
    for (const c of post.categories) addWeight(tokens, c.name, WEIGHT_TAG);
    for (const slug of [...post.styles, ...post.industries, ...post.elements]) {
      addWeight(tokens, slug.replace(/-/g, " "), WEIGHT_TAG);
    }
    if (post.interaction) addWeight(tokens, post.interaction, WEIGHT_TAG);

    let length = 0;
    for (const [token, weight] of tokens) {
      length += weight;
      const list = postings.get(token) ?? [];
      list.push(i);
      postings.set(token, list);
    }
    docWeights.push({ tokens, length: length || 1 });

    textTokens.push(
      new Set(tokenize(`${post.title ?? ""} ${post.caption ?? ""}`)),
    );
    const first = post.media[0];
    aspects.push(
      first?.width && first?.height ? first.width / first.height : null,
    );

    const hsl: CorpusIndex["palettes"][number] = [];
    for (const m of post.media) {
      for (const swatch of m.colors) {
        const c = rgbToHsl(swatch.r, swatch.g, swatch.b);
        hsl.push({ h: c.h, s: c.s, l: c.l, percent: swatch.percent });
      }
    }
    palettes.push(hsl);
  }

  const idf = new Map<string, number>();
  const n = Math.max(1, posts.length);
  for (const [token, list] of postings) {
    idf.set(token, Math.log(1 + n / list.length));
  }

  // Tag vocabulary with live counts; legacy categories stay out of the palette.
  const publicCats = new Set<string>(PUBLIC_CATEGORY_SLUGS);
  const facets: Record<FacetKind, FacetTermIndex[]> = {
    category: [],
    element: [],
    style: [],
    industry: [],
  };
  const bySlug: Record<FacetKind, Map<string, FacetTermIndex>> = {
    category: new Map(),
    element: new Map(),
    style: new Map(),
    industry: new Map(),
  };
  for (const kind of FACET_KINDS) {
    for (const term of snapshot.vocab[kind]) {
      if (kind === "category" && !publicCats.has(term.slug)) continue;
      const count = byFacet[kind].get(term.slug)?.length ?? 0;
      if (count === 0) continue;
      const entry: FacetTermIndex = { ...term, kind, count };
      facets[kind].push(entry);
      bySlug[kind].set(term.slug, entry);
    }
    facets[kind].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  const vocabByPhrase = new Map<string, FacetTermIndex[]>();
  const addPhrase = (phrase: string, term: FacetTermIndex) => {
    if (!phrase) return;
    const list = vocabByPhrase.get(phrase) ?? [];
    if (!list.includes(term)) list.push(term);
    vocabByPhrase.set(phrase, list);
  };
  for (const kind of FACET_KINDS) {
    for (const term of facets[kind]) {
      for (const phrase of phrasesFor(term)) addPhrase(phrase, term);
    }
  }
  for (const [phrase, target] of Object.entries(SYNONYMS)) {
    const term = bySlug[target.kind].get(target.slug);
    if (term) addPhrase(normalizePhrase(phrase), term);
  }

  const neighbors = new Map<string, CorpusNeighbor[]>();
  for (const row of snapshot.neighbors) {
    neighbors.set(row.postId, row.neighbors);
  }

  const byCategoryRecent = byFacet.category;

  return {
    snapshot,
    posts,
    cards,
    positionOf,
    byFacet,
    recent,
    oldest: [...recent].reverse(),
    featured: recent.filter((i) => posts[i]!.featured),
    hiddenGems: recent.filter((i) => posts[i]!.hiddenGem),
    byCategoryRecent,
    postings,
    docWeights,
    textTokens,
    aspects,
    idf,
    palettes,
    neighbors,
    facets,
    vocabByPhrase,
  };
}

let cached: { snapshot: CorpusSnapshot; index: CorpusIndex } | null = null;

/**
 * The derived index for the current snapshot.
 *
 * Keyed on the snapshot's identity, not a timestamp: a refresh that finds
 * nothing changed returns the very same object, and this reuses the index
 * instead of spending ~30ms rebuilding an identical one.
 */
export async function getCorpusIndex(): Promise<CorpusIndex> {
  const snapshot = await getSnapshot();
  if (cached && cached.snapshot === snapshot) return cached.index;
  const index = buildIndex(snapshot);
  cached = { snapshot, index };
  return index;
}

export type { Hsl };
