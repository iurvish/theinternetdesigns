import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, industries, styles } from "@/lib/db/schema";
import { PUBLIC_CATEGORY_SLUGS } from "./taxonomy";

export type VocabKind = "category" | "style" | "industry" | "element";

export type VocabTerm = {
  kind: VocabKind;
  slug: string;
  name: string;
  count: number;
};

export type QueryMatch = {
  category?: VocabTerm;
  style?: VocabTerm;
  industry?: VocabTerm;
  element?: VocabTerm;
};

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "in",
  "on",
  "with",
  "from",
  "by",
  "design",
  "designs",
  "designer",
  "page",
  "pages",
  "screen",
  "screens",
  "app",
  "apps",
  "ui",
  "ux",
  "web",
  "website",
  "site",
  "work",
  "new",
  "best",
  "cool",
]);

const SYNONYMS: Record<string, { kind: VocabKind; slug: string }> = {
  dashboard: { kind: "category", slug: "dashboards" },
  dashboards: { kind: "category", slug: "dashboards" },
  admin: { kind: "category", slug: "dashboards" },
  analytics: { kind: "category", slug: "dashboards" },
  landing: { kind: "category", slug: "landing-page" },
  "landing page": { kind: "category", slug: "landing-page" },
  "landing pages": { kind: "category", slug: "landing-page" },
  mobile: { kind: "category", slug: "mobile-apps" },
  "mobile app": { kind: "category", slug: "mobile-apps" },
  "mobile apps": { kind: "category", slug: "mobile-apps" },
  ios: { kind: "category", slug: "mobile-apps" },
  android: { kind: "category", slug: "mobile-apps" },
  interface: { kind: "category", slug: "interfaces" },
  interfaces: { kind: "category", slug: "interfaces" },
  interaction: { kind: "category", slug: "interactions" },
  interactions: { kind: "category", slug: "interactions" },
  motion: { kind: "category", slug: "interactions" },
  animation: { kind: "category", slug: "interactions" },
  microinteraction: { kind: "category", slug: "interactions" },
  logo: { kind: "category", slug: "logo-design" },
  logos: { kind: "category", slug: "logo-design" },
  "logo design": { kind: "category", slug: "logo-design" },
  brand: { kind: "category", slug: "brand-design" },
  branding: { kind: "category", slug: "brand-design" },
  "brand design": { kind: "category", slug: "brand-design" },
  type: { kind: "category", slug: "typography" },
  typeface: { kind: "category", slug: "typography" },
  typography: { kind: "category", slug: "typography" },
  illustration: { kind: "category", slug: "illustration" },
  illustrations: { kind: "category", slug: "illustration" },
  "dark mode": { kind: "style", slug: "dark" },
  "dark ui": { kind: "style", slug: "dark" },
  "light mode": { kind: "style", slug: "light" },
  "light ui": { kind: "style", slug: "light" },
  "command palette": { kind: "element", slug: "command-palette" },
  cmdk: { kind: "element", slug: "command-palette" },
  "empty state": { kind: "element", slug: "empty-state" },
  "pricing page": { kind: "element", slug: "pricing" },
  "pricing table": { kind: "element", slug: "pricing" },
  login: { kind: "element", slug: "auth" },
  signup: { kind: "element", slug: "auth" },
  modal: { kind: "element", slug: "popup" },
  dialog: { kind: "element", slug: "popup" },
  chat: { kind: "element", slug: "chat-input" },
  composer: { kind: "element", slug: "chat-input" },
  kanban: { kind: "element", slug: "kanban-board" },
  nav: { kind: "element", slug: "navbar" },
};

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[#@]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keysFor(slug: string, name: string, extra: string[] = []): string[] {
  const keys = new Set<string>();
  const push = (value: string) => {
    const n = normalize(value);
    if (!n) return;
    keys.add(n);
    if (n.endsWith("s") && n.length > 3) keys.add(n.slice(0, -1));
    else keys.add(`${n}s`);
  };
  push(slug);
  push(name);
  for (const item of extra) push(item);
  return [...keys];
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

async function loadVocabUncached(): Promise<{
  byKind: Record<VocabKind, Map<string, VocabTerm>>;
  index: Map<string, VocabTerm[]>;
}> {
  const [catRows, styleRows, industryRows, elementRows] = await Promise.all([
    db
      .select({
        slug: categories.slug,
        name: categories.name,
      })
      .from(categories),
    db.select({ slug: styles.slug, name: styles.name }).from(styles),
    db.select({ slug: industries.slug, name: industries.name }).from(industries),
    db.execute<{
      slug: string;
      name: string;
      aliases: unknown;
    }>(sql`
      select slug, name, aliases from elements
    `),
  ]);

  const byKind: Record<VocabKind, Map<string, VocabTerm>> = {
    category: new Map(),
    style: new Map(),
    industry: new Map(),
    element: new Map(),
  };
  const index = new Map<string, VocabTerm[]>();

  const add = (
    kind: VocabKind,
    slug: string,
    name: string,
    extra: string[] = [],
  ) => {
    const term: VocabTerm = { kind, slug, name, count: 0 };
    byKind[kind].set(slug, term);
    for (const key of keysFor(slug, name, extra)) {
      const list = index.get(key) ?? [];
      list.push(term);
      index.set(key, list);
    }
  };

  const publicCats = new Set<string>(PUBLIC_CATEGORY_SLUGS);

  for (const row of catRows) {
    if (!publicCats.has(row.slug)) continue;
    add("category", row.slug, row.name);
  }
  for (const row of styleRows) add("style", row.slug, row.name);
  for (const row of industryRows) add("industry", row.slug, row.name);
  for (const row of asRows<{ slug: string; name: string; aliases: unknown }>(
    elementRows,
  )) {
    const extra = Array.isArray(row.aliases)
      ? row.aliases.filter((a): a is string => typeof a === "string")
      : [];
    add("element", row.slug, row.name, extra);
  }

  for (const [phrase, syn] of Object.entries(SYNONYMS)) {
    const term = byKind[syn.kind].get(syn.slug);
    if (!term) continue;
    const list = index.get(normalize(phrase)) ?? [];
    list.push(term);
    index.set(normalize(phrase), list);
  }

  return { byKind, index };
}

const getVocab = () =>
  unstable_cache(loadVocabUncached, ["jev-search-vocab-v1"], {
    revalidate: 300,
  })();

function pickTerm(candidates: VocabTerm[], used: Set<VocabKind>): VocabTerm | null {
  const remaining = candidates.filter((c) => !used.has(c.kind));
  if (remaining.length === 0) return null;
  const preferred: VocabKind[] = ["category", "element", "style", "industry"];
  for (const kind of preferred) {
    const hit = remaining.find((c) => c.kind === kind);
    if (hit) return hit;
  }
  return remaining[0] ?? null;
}

/**
 * Map any gallery query onto live categories, styles, industries, and elements.
 * Dashboard is only one of those vocabularies — logos, landing pages, dark UI,
 * pricing, fintech, etc. all resolve the same way.
 */
export async function matchSearchQuery(query: string): Promise<QueryMatch> {
  const q = normalize(query);
  if (!q) return {};
  const { index } = await getVocab();
  const tokens = q.split(" ").filter(Boolean);
  const usedKind = new Set<VocabKind>();
  const usedToken = new Set<number>();
  const match: QueryMatch = {};

  const tryPhrase = (phrase: string, span?: { start: number; n: number }) => {
    const candidates = index.get(phrase);
    if (!candidates || candidates.length === 0) return false;
    if (STOP.has(phrase) && !SYNONYMS[phrase]) return false;
    const term = pickTerm(candidates, usedKind);
    if (!term) return false;
    usedKind.add(term.kind);
    if (term.kind === "category") match.category = term;
    if (term.kind === "style") match.style = term;
    if (term.kind === "industry") match.industry = term;
    if (term.kind === "element") match.element = term;
    if (span) {
      for (let i = 0; i < span.n; i++) usedToken.add(span.start + i);
    }
    return true;
  };

  tryPhrase(q);

  for (let n = Math.min(4, tokens.length); n >= 1; n--) {
    for (let i = 0; i <= tokens.length - n; i++) {
      if (Array.from({ length: n }, (_, k) => i + k).some((t) => usedToken.has(t))) {
        continue;
      }
      tryPhrase(tokens.slice(i, i + n).join(" "), { start: i, n });
    }
  }

  return match;
}
