/**
 * Demo seeding for the Websites surface.
 *
 * `posts.site_url` is normally written by the admin app. This fills it for a
 * handful of posts so the website cards and the framed preview have something
 * to render before that pipeline exists.
 *
 * The pairings are arbitrary — a post's screenshot will not match the site it
 * points at. This is placeholder data, not content.
 *
 * Every URL below was checked for `X-Frame-Options` and a `frame-ancestors`
 * CSP and returned neither, so the preview actually loads rather than falling
 * back. Re-check before adding: most large sites block framing.
 *
 *   bun --env-file=.env.local scripts/seed-site-urls.ts
 *   bun --env-file=.env.local scripts/seed-site-urls.ts --clear
 */
import postgres from "postgres";

const SITES = [
  "https://supabase.com",
  "https://tailwindcss.com",
  "https://planetscale.com",
  "https://neon.tech",
  "https://cal.com",
  "https://liveblocks.io",
  "https://astro.build",
  "https://svelte.dev",
  "https://remix.run",
  "https://bun.sh",
  "https://react.dev",
  "https://vitejs.dev",
  "https://nuxt.com",
  "https://solidjs.com",
  "https://qwik.dev",
  "https://turbo.build",
  "https://drizzle.team",
  "https://trpc.io",
  "https://hono.dev",
  "https://biomejs.dev",
  "https://motion.dev",
  "https://ui.shadcn.com",
  "https://lucide.dev",
  "https://tldraw.com",
  "https://excalidraw.com",
  "https://posthog.com",
  "https://plausible.io",
  "https://inngest.com",
];

const connection = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connection) throw new Error("DIRECT_URL or DATABASE_URL required");

const sql = postgres(connection, { prepare: false });
const clear = process.argv.includes("--clear");

try {
  if (clear) {
    const cleared = await sql`
      update posts set site_url = null, updated_at = now()
      where site_url is not null returning id`;
    console.log(`cleared site_url on ${cleared.length} posts`);
  } else {
    // Prefer landing pages — that is what the Websites nav item points at —
    // and top up from the rest of the published set if there aren't enough.
    const rows = await sql<{ id: string }[]>`
      with ranked as (
        select p.id,
               (exists (
                 select 1 from post_categories pc
                 join categories c on c.id = pc.category_id
                 where pc.post_id = p.id and c.slug = 'landing-page'
               )) as is_landing,
               p.created_at
        from posts p
        where p.published = true
      )
      select id from ranked
      order by is_landing desc, created_at desc
      limit ${SITES.length}`;

    if (rows.length === 0) throw new Error("no published posts found");

    for (const [i, row] of rows.entries()) {
      // `updated_at` matters: the corpus snapshot's freshness fingerprint is
      // counts plus max(updated_at), so an update that leaves the timestamp
      // alone is invisible to every running instance — the gallery would keep
      // serving the old snapshot indefinitely.
      await sql`
        update posts set site_url = ${SITES[i]!}, updated_at = now()
        where id = ${row.id}`;
    }
    console.log(`set site_url on ${rows.length} posts`);
    for (const [i, row] of rows.entries()) {
      console.log(`  ${row.id}  ->  ${SITES[i]}`);
    }
  }
} finally {
  await sql.end();
}
