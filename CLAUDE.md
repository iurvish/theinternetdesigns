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

Postgres (Supabase, pooled, `prepare: false`) → Drizzle → `features/posts/queries.ts` → server components → client components. R2 holds media; the CDN URL is read from `R2_PUBLIC_URL` at build time into `next.config.ts`.

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

### Jev (TypeSafe AI)

`lib/jev/` wraps `experimental_evaluate`. Every call is optional: `jevConfigured()` gates it and `jevEvaluate` swallows errors, so the site works without `TYPESAFE_AI_API_KEY`.

Search interpretation is two-tier, and the order matters for cost: `matchSearchQuery` (local vocabulary + synonyms, cached) runs first, and **Jev is only asked when the query maps onto nothing**. Keep that ordering — routing every keystroke to an LLM is the failure mode this exists to avoid.

**`unstable_cache` round-trips its value through JSON.** Never cache a `Map`, `Set`, or `Date`-keyed structure — cache plain rows and rebuild. This silently broke `matchSearchQuery` for a long time (`index.get is not a function`), killing the alias fast path.

### Caching

- `unstable_cache` for DB reads that repeat (facets 300s, previews 300s, similar posts 3600s).
- Module-level `Map`s in client components (`feedPageCache`, `facetsCache`, `previewCache`) survive remounts within a JS realm.
- Anything running a pgvector scan or a Jev call **must** be cached. The lightbox's similar-posts lookup was uncached while the post page's identical call was cached for an hour — ~2.5s repeated on every open.

The DB is in `ap-south-1` with ~30ms warm RTT, so **round-trips dominate**, not query cost. Fold multi-step reads into one SQL statement (CTE + `row_number()` + `left join lateral`) rather than chaining awaits; that alone took the palette preview from ~127ms to ~40ms.

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
- `plainto_tsquery` ANDs every word, so multi-word FTS often returns nothing where the vocabulary matcher succeeds. Fall back rather than reporting zero.
- Only ~198 of ~651 posts have embeddings; similar-designs is legitimately empty for the rest. Don't debug it as a bug.
- `getRecentPosts` orders by `createdAt` (when it was added to the gallery), not `publishedAt` (the source post's date).
- Server actions log their timing in the dev server output — the fastest way to find a slow one.
