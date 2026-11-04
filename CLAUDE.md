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

`ExploreFeed` owns the shell (sidebar rail, mobile drawer, chip rail) and filter state; `FeedBody` owns posts and the lightbox. Three mutually exclusive modes paint the grid:

- **Browse** — paginated, infinite scroll, prefetched per category on idle.
- **Colour** — `searchByColorsAction`, whole result set in one request.
- **Search** — `runSearchAction`, whole result set in one request.

Colour and keyword search clear each other, and a category click clears both. Pagination is disabled in either replace-the-grid mode (the `paging` flag). Async results are tagged with their filter key so a stale response can never paint over a newer one — follow that pattern for any new mode.

SSR paints `StaticFeedCard` at **four** breakpoints (1 / 2 / 3 / 4 columns, the last from `xl`); after hydration `useMasonryReady()` drops the inactive trees so images and `layoutId`s exist exactly once. Positions must not shift between the two. The cache key is `category|view|order` — all three, or a view switch reads another view's page.

**`view` and `order` are separate axes.** `featured` and `hidden_gems` are *subsets* of the recent order in `lib/corpus/index.ts`, not orderings, so `getRecentPosts` takes `{ view, order }` and an "oldest" collection is just the subset reversed. The sort menu still presents one flat list of four; `splitSort` / `joinSort` in `explore-feed.tsx` map between the two.

The sidebar's nav rows are category shortcuts (`SIDEBAR_NAV` in `components/layout/app-sidebar.tsx`): Designs → `all`, Websites → `landing-page`, App Screenshots → `mobile-apps`. They drive the same `active` state the chips do, so picking one lights the matching chip. **Creators is deliberately inert** — there is no creators surface behind it.

### Websites (`website-card.tsx`, `website-preview.tsx`)

**Designs and websites are separate surfaces, not two filters over one pile.**
`FeedSurface` (`"designs" | "websites"`) is the coarsest cut in
`getRecentPosts`: a post with a `siteUrl` is a website entry and never appears
in the design feed, and vice versa. `index.websitePositions` is the Set that
splits them. The surface is part of the feed cache key
(`surface|category|view|order`) — drop it and a view switch reads another
surface's page.

A website entry renders a `WebsiteCard`: a live `<iframe>` of the site scaled
into the tile, plus a favicon/name/host row. Clicking opens `WebsitePreview`,
a dialog with the site framed full-size and an "Open Site" button.

- **`posts.site_url` is the live site; `source_url` is the X post or pin.** They
  are not interchangeable. Only the admin app writes `site_url`, so it is
  nullable and the surface is inert until it's populated.
- `scripts/seed-site-urls.ts` fills it for 28 landing-page posts as **demo
  data** — the pairings are arbitrary and the screenshot won't match the site.
  Every URL in it was checked to send neither `X-Frame-Options` nor a
  `frame-ancestors` CSP, so the frame actually loads; re-check before adding
  one. `--clear` wipes the column.
- The same `WebsiteCard` renders in both the SSR and hydrated trees (it carries
  no Motion), so the markup is byte-identical and nothing resizes on hydration.
  `postAspectRatioValue` must return the tile's ratio for these, or the column
  packer works from a height the card never has.
- **The tile's height comes from `FRAME_H`.** The frame renders at 1280px wide
  (so you see the desktop layout, not the mobile breakpoint) and is scaled by
  `measuredWidth / FRAME_W`; the tile's `aspect-ratio` is `FRAME_W / FRAME_H`,
  so the two always match. The scale is measured with a `ResizeObserver`
  because CSS cannot divide a length by a length to get a unitless factor.
- **Card frames scroll but never take a click.** The frame is
  `pointer-events-none`, so the whole card stays one button that opens the
  dialog; scrolling is reimplemented in `LiveTile`, which renders a
  `FRAME_RENDER_H`-tall strip and moves its `top` on a non-passive `wheel`
  listener. You cannot scroll a cross-origin frame from the parent, and making
  it interactive hands it the clicks too — this is the only split that gives
  both. The handler stops calling `preventDefault` at either end of the strip
  so the feed takes the wheel back instead of the card trapping it. React's
  `onWheel` won't work here: it routes through a passive root listener.
- Frames mount via `IntersectionObserver` 1200px ahead and unmount 20s after
  leaving. Each one is a full page load — mount them all and the feed stalls;
  unmount them instantly and a scroll up-and-back reloads everything.
- **Never use `post.thumbnail` as the frame's placeholder.** It's a screenshot
  of the design the post came from, not of the site, so it flashed an
  unrelated page under every card. Both the card and the dialog use a plain
  skeleton.
- Websites cap at three columns (`maxColumns`): a fourth shrinks a scaled
  desktop page past readable.
- **Framing fails for a large share of sites** (`X-Frame-Options`,
  `frame-ancestors`). There is no event for it, so `WebsitePreview` times out
  after 4s and surfaces the stored screenshot plus an "Open" link rather than a
  white rectangle. Don't "fix" that timeout into a spinner.
- `db:generate` is broken in this repo (colliding drizzle meta snapshots,
  predates `0014`), so `drizzle/0014_post_site_url.sql` and its `_journal.json`
  entry were written by hand. **The local journal is behind the database
  ledger** — `drizzle.__drizzle_migrations` held entries past the journal's
  last `when`, and `migrate` only applies entries newer than the ledger's
  high-water mark, so a hand-written entry stamped `last + 1` is silently
  skipped and reported as success. Stamp new entries well past the ledger
  (`select max(created_at) from drizzle.__drizzle_migrations`) and verify the
  column landed rather than trusting the "applied successfully" line.

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

- **The shell is tokenised; the overlay and palette are not.** `app/globals.css` holds an oklch ramp on a single hue (258) — `shell` `canvas` `panel` `field` `line` `ink` `ink-2` `ink-3` `ink-4` `chip` `chip-hover` `chip-on` `chip-on-fg` `skel` — used as `bg-shell`, `text-ink-2`, `border-line`. Use these for anything in the shell, feed or chips. `ink-4` is **non-text only** (3.1:1); body copy on a light surface stops at `ink-2`. `post-overlay.tsx` and `search-command.tsx`'s palette still carry the old literals — leave them unless you are restyling those surfaces wholesale.
- **Chrome is still skeuomorphic "Paper"** — layered `shadow-[...]` raised stacks and rounded corners on every control (chips, sort pill, search field, colour buttons all share one shadow string). What's gone is the hero wordmark, the paper-curl, the bordered toolbar sheet, and the **white inset bevels**: both planes are now `#fafafa`, and a pure-white bevel on that is lighter than the surface, so it drew a visible line that read as a container edge.
- **The rail's right edge is a 1px gradient column, not a border** (`RailEdge` in `app-sidebar.tsx`): shell colour at both ends, `--color-line` through the middle 28–72%, so the seam fades out top and bottom. A `border-r` can't do this — borders take one colour. `ExploreFeedFallback` repeats it as a `background-image` so the skeleton doesn't flash a hard rule.
- **New values go in `rem`**, including arbitrary ones (`text-[0.8125rem]`, `size-[1.125rem]`). Tailwind's own scale is already rem, so prefer `h-9` / `gap-2.5` over an arbitrary value when it maps exactly.
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
