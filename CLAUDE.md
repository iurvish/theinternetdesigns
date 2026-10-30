# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The import above is not boilerplate. **Next.js 16.2 here differs from training data** — read the relevant guide in `node_modules/next/dist/docs/` before writing framework code, and heed deprecation notices.

## Commands

```bash
npm run dev          # dev server (Turbopack)
npm run build        # production build — also runs tsc
npm run lint         # eslint
npx tsc --noEmit     # typecheck alone (faster than build)

npm run db:generate  # generate a Drizzle migration from schema.ts
npm run db:migrate   # apply migrations (uses DIRECT_URL, unpooled)
npm run db:studio    # Drizzle Studio

npm run seed:categories      # seed public categories
npm run backfill:colors      # extract media colour palettes
bun run backfill:jev-tags    # re-classify posts with Jev
bun run jev:smoke            # ping Jev
```

There is **no test suite.** Verify with `npx tsc --noEmit`, `npm run lint`, and by driving the running app.

`lint` has ~7 pre-existing `react-hooks/set-state-in-effect` errors in `explore-feed.tsx` and `post-overlay.tsx`. Before claiming a lint regression, compare against baseline: `git stash && npx eslint <file>; git stash pop`.

Scripts that hit the database need env: `bun --env-file=.env.local <script>`, or `bunx tsx --env-file=.env.local`. A scratch script must live **inside the repo** to resolve `node_modules`, and `tsx` needs `.mts` for top-level await.

## Architecture

Read-only public gallery. **Publishing and tagging live in a separate admin app** — this codebase never writes posts, media, or embeddings.

### Data flow

Postgres (Supabase, pooled, `prepare: false`) → Drizzle → **`lib/corpus` (in-memory snapshot)** → `features/posts/queries.ts` → server components → client components. R2 holds media; the CDN URL is read from `R2_PUBLIC_URL` at build time into `next.config.ts`.

**Reads do not hit the database.** The whole published gallery — ~650 cards, their media, palettes, all four tag vocabularies, and every embedded post's nearest neighbours — is ~2MB, so it is loaded once per server instance and everything is answered from RAM. Feed, search, colour, facets, similar designs and the post detail page are all array work: sub-millisecond, no round-trip, no LLM.

`lib/db/schema.ts` does **not** cover the whole database. `elements` / `post_elements` predate it and are reachable only through raw `sql`. Four parallel tag vocabularies hang off posts:

| Vocabulary | Join table | In schema.ts? |
| --- | --- | --- |
| `categories` (public nav) | `post_categories` | yes |
| `elements` (component/screen patterns, has `aliases`) | `post_elements` | **no** |
| `styles` | `post_styles` | yes |
| `industries` | `post_industries` | yes |

`categories` holds ~35 rows but only the 11 in `PUBLIC_CATEGORY_SLUGS` (`lib/jev/taxonomy.ts`) are public — **always filter by it**, or legacy rows leak into nav and search.

### Two media URL paths

1. **Direct CDN** — what `<Image>` renders. No CORS, so canvas reads are tainted.
2. **`/media-cdn/*`** — a same-origin rewrite in `next.config.ts`, used to warm a snapshot so overlay copy can read pixels.
3. **`/api/media/[id]`** — DB-keyed R2 proxy, the fallback when the CDN response is still opaque. Keyed on the media **row id, never a URL** — that is what keeps it from being an SSRF hop. Preserve that.

### The corpus (`lib/corpus/`)

| File | Holds |
| --- | --- |
| `snapshot.ts` | the three build queries + the stale-while-revalidate singleton |
| `index.ts` | derived indexes: cards, tag postings, token index, HSL palettes, neighbours, vocabulary |
| `search.ts` | query → tags + text, then tiered ranking |
| `similar.ts` | neighbour + metadata scoring for "more designs like this" |

Rules that keep it correct:

- **The snapshot stays plain JSON.** No `Map`, `Set` or `Date` in it — rebuild those in `index.ts`. (`unstable_cache` round-trips values through JSON; storing a `Map` silently flattened it to `{}`, which is how the old alias fast path broke with `index.get is not a function`.)
- **Published posts only.** The snapshot is the published set, so anything reading it is already filtered. `getPostById` falls back to a direct read so a draft reached by URL still renders.
- **Freshness is a TTL plus a fingerprint**, not an invalidation. Every 60s a request triggers a ~130-byte `loadVersion()` check (counts + max-timestamps); the ~1.9MB snapshot is only re-fetched when that string changes, and an unchanged check returns the *same object* so the derived index is reused too. New posts appear within ~60s. **Don't drop the version check** — rebuilding on the timer alone is ~78GB of egress a month per instance, which on Supabase's free tier is the difference between ~55MB and blowing the quota in a day.
- `instrumentation.ts` starts the build at boot without awaiting it, so the first request usually finds it warm.

### Jev (TypeSafe AI)

`lib/jev/` wraps `experimental_evaluate`, and **nothing on the read path calls it any more.** What remains (`client.ts`, `classify-post.ts`, `persist-classification.ts`) is for the offline tagging scripts.

Search interpretation and the similar-designs rerank used to go through Jev; both were removed. Measured, the hop cost 400–800ms on search and ~300–1000ms on similar, and it was also losing results — it answered "no tag" on queries the vocabulary covers, and its >= 0.85 cutoff routinely cut a 12-card similar grid to five. The local vocabulary in `lib/corpus/index.ts` (`SYNONYMS` + slugs + names + element aliases) does the same job in microseconds. **If you add a synonym, point it at a slug that exists** — several of the old ones named styles the database never had.

### Caching

- Nothing on the read path uses `unstable_cache` any more; the snapshot singleton is the cache.
- Module-level `Map`s in client components (`feedPageCache`, `searchResultCache`, `colorResultCache`, `similarCache`, `facetsCache`, `previewCache`) survive remounts within a JS realm. With the server at ~0ms, the server-action round trip is the remaining latency, so caching and prefetching on the client is what makes the lightbox feel instant.

The DB is in `ap-south-1` and round-trips measured 70–180ms from a dev machine, so **round-trips dominate**, not query cost. Anything new that must query per request should be one statement (CTE + `row_number()` + `left join lateral`), but prefer adding to the snapshot.

Reads no longer scale with traffic — the database sees ~1 tiny query a minute per instance plus a rebuild when content actually changes — so DB cost is a function of publishing rate and instance count, not page views. Images come from R2/CDN and never touch Supabase.

Three measurements worth not rediscovering:

- **Never select whole post rows.** `provider_meta` averages 2KB a post of raw provider payload that nothing public renders; `select *` minus the embedding was 140KB where the fields actually used are 12KB.
- **Cast `halfvec` once.** `embedding::halfvec(2048)` inside a join re-casts per candidate pair: 1554ms for the all-pairs neighbour build. Hoisting the cast into a `with … as materialized` CTE makes the same query 72ms.

### The feed (`features/posts/explore-feed.tsx`, ~1700 lines)

`ExploreFeed` owns filter state; `FeedBody` owns posts and the lightbox. Three mutually exclusive modes paint the grid:

- **Browse** — paginated, infinite scroll, prefetched per category on idle.
- **Colour** — `searchByColorsAction`, whole result set in one request.
- **Search** — `runSearchAction`, whole result set in one request.

Colour and keyword search clear each other, and a category click clears both. Pagination is disabled in either replace-the-grid mode (the `paging` flag). Async results are tagged with their filter key so a stale response can never paint over a newer one — follow that pattern for any new mode.

SSR paints `StaticFeedCard` at all three breakpoints; after hydration `useMasonryReady()` drops the inactive trees so images and `layoutId`s exist exactly once. Positions must not shift between the two.

### Lightbox (`post-overlay.tsx`)

Shared-element morph via Motion `layoutId={`post-${id}`}`, with a separate morph layer and filmstrip layer that hand off by opacity. The comments explain the ordering — it is load-bearing, and changing a transition in isolation tends to reintroduce a see-through flash.

It scrolls an **inner** element, not the window, so there is no window scroll to listen to. It marks itself `data-post-overlay` so the feed's ⌘K handler can yield the keyboard; both bind window-level arrow and Escape keys.

### Search palette (`features/posts/search-*.ts[x]`)

- `search-filter.ts` — shared types, **no server imports**, safe for client.
- `search-facets.ts` — `server-only`; vocabulary counts and previews.
- `search-actions.ts` — the `"use server"` boundary.
- `search-command.tsx` — trigger + palette UI.

Client files import server types with `import type` only (erased at compile time) — the established pattern for `server-only` modules here.

## Conventions

- **Design tokens are literal, not themed**: `#f7f7f7` surface, `#e3e5e8` borders, `#1f2123` ink, `#707275` secondary. Chrome is skeuomorphic "Paper" — layered `shadow-[...]` stacks with white inset bevels. Match neighbouring components rather than inventing values.
- Beware `overflow-hidden` on a wrapper whose child carries the raised shadow; it clips it and the control reads flat.
- **Motion vocabulary** (stated in `post-overlay.tsx`): springs for anything spatial, quick eases for opacity. Always pair with `motion-reduce:`.
- Comments explain **why**, not what. Match that register — several non-obvious decisions here are only recoverable from them.
- `features/posts/` is the domain; `components/ui/` is shadcn primitives; `components/layout/` is chrome.

Vendored skills live in `.agents/skills/` (pinned in `skills-lock.json`) — `better-ui`, `better-interface`, `improve-animations` cover the craft bar this UI is held to.

## Gotchas

- `searchPostsByColors` matches in **HSL**, not RGB — hue for chromatic colours, lightness for neutrals.
- Postgres FTS is no longer on the read path. `plainto_tsquery` ANDed every word, so "dark fintech dashboard" matched nothing lexically — the in-memory scorer ORs terms and weights by field instead. `search_tsv` still exists in the database; don't reintroduce a query against it without a reason.
- Only ~198 of ~651 posts have embeddings; similar-designs is legitimately empty for the rest. Don't debug it as a bug. A short strip (three or five cards) is also by design — the scorer's `keep` gate drops off-category neighbours rather than padding the grid.
- `getRecentPosts` orders by `createdAt` (when it was added to the gallery), not `publishedAt` (the source post's date).
- Server actions log their timing in the dev server output — the fastest way to find a slow one.
