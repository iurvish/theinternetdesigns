import { config } from "dotenv";

config({ path: ".env.local" });

import postgres from "postgres";

/**
 * Rewrite stored R2 public URLs from the old pub-*.r2.dev host to your
 * custom CDN domain (R2_PUBLIC_URL). Files in the bucket are unchanged —
 * only the hostname in the DB is updated so browsers hit Cloudflare cache.
 *
 *   bun run scripts/rewrite-r2-cdn-urls.ts [--dry-run]
 *   npm run backfill:cdn-urls
 *
 * Optional override if you need a specific old host:
 *   OLD_R2_PUBLIC_URL=https://pub-xxx.r2.dev npm run backfill:cdn-urls
 */
function stripSlash(url: string) {
  return url.replace(/\/$/, "");
}

function rewriteUrl(
  value: string | null,
  fromBases: string[],
  toBase: string,
): string | null {
  if (!value) return value;
  for (const from of fromBases) {
    if (value === from || value.startsWith(`${from}/`)) {
      return `${toBase}${value.slice(from.length)}`;
    }
  }
  return value;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const toBase = process.env.R2_PUBLIC_URL?.trim();
  if (!toBase) {
    throw new Error("R2_PUBLIC_URL is not set (e.g. https://cdn.theinternetdesigns.com).");
  }
  if (toBase.includes("r2.dev")) {
    throw new Error(
      `R2_PUBLIC_URL still points at r2.dev (${toBase}). Set it to your custom domain first.`,
    );
  }

  const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DIRECT_URL / DATABASE_URL is not set.");

  const to = stripSlash(toBase);
  const explicitOld = process.env.OLD_R2_PUBLIC_URL?.trim();
  const fromBases = new Set<string>();
  if (explicitOld) fromBases.add(stripSlash(explicitOld));

  const sql = postgres(dbUrl, { max: 1 });

  try {
    // Discover old hosts still present in the DB.
    const samples = await sql<{ url: string }[]>`
      SELECT DISTINCT url FROM (
        SELECT original_url AS url FROM media WHERE original_url IS NOT NULL
        UNION ALL
        SELECT thumbnail_url FROM media WHERE thumbnail_url IS NOT NULL
        UNION ALL
        SELECT medium_url FROM media WHERE medium_url IS NOT NULL
        UNION ALL
        SELECT poster_url FROM media WHERE poster_url IS NOT NULL
        UNION ALL
        SELECT avatar_url FROM creators WHERE avatar_url IS NOT NULL
      ) u
      WHERE url LIKE 'https://%.r2.dev/%'
         OR url LIKE 'http://%.r2.dev/%'
    `;

    for (const row of samples) {
      try {
        const u = new URL(row.url);
        fromBases.add(stripSlash(`${u.protocol}//${u.host}`));
      } catch {
        // skip malformed
      }
    }

    const fromList = [...fromBases].filter((b) => b !== to);
    if (fromList.length === 0) {
      console.log("No r2.dev URLs found in media/creators — nothing to rewrite.");
      return;
    }

    console.log(`Target CDN: ${to}`);
    console.log(`Old bases:  ${fromList.join(", ")}`);
    if (dryRun) console.log("Dry run — no writes.\n");

    const mediaRows = await sql<{
      id: string;
      original_url: string;
      thumbnail_url: string | null;
      medium_url: string | null;
      poster_url: string | null;
    }[]>`
      SELECT id, original_url, thumbnail_url, medium_url, poster_url
      FROM media
      WHERE original_url LIKE '%r2.dev%'
         OR thumbnail_url LIKE '%r2.dev%'
         OR medium_url LIKE '%r2.dev%'
         OR poster_url LIKE '%r2.dev%'
    `;

    let mediaUpdated = 0;
    for (const row of mediaRows) {
      const next = {
        original_url: rewriteUrl(row.original_url, fromList, to)!,
        thumbnail_url: rewriteUrl(row.thumbnail_url, fromList, to),
        medium_url: rewriteUrl(row.medium_url, fromList, to),
        poster_url: rewriteUrl(row.poster_url, fromList, to),
      };
      const changed =
        next.original_url !== row.original_url ||
        next.thumbnail_url !== row.thumbnail_url ||
        next.medium_url !== row.medium_url ||
        next.poster_url !== row.poster_url;
      if (!changed) continue;

      mediaUpdated++;
      if (dryRun) {
        console.log(`[media] ${row.id}: ${row.original_url} → ${next.original_url}`);
        continue;
      }
      await sql`
        UPDATE media SET
          original_url = ${next.original_url},
          thumbnail_url = ${next.thumbnail_url},
          medium_url = ${next.medium_url},
          poster_url = ${next.poster_url}
        WHERE id = ${row.id}
      `;
    }

    const creatorRows = await sql<{ id: string; avatar_url: string }[]>`
      SELECT id, avatar_url
      FROM creators
      WHERE avatar_url LIKE '%r2.dev%'
    `;

    let creatorsUpdated = 0;
    for (const row of creatorRows) {
      const nextAvatar = rewriteUrl(row.avatar_url, fromList, to);
      if (!nextAvatar || nextAvatar === row.avatar_url) continue;
      creatorsUpdated++;
      if (dryRun) {
        console.log(`[creator] ${row.id}: ${row.avatar_url} → ${nextAvatar}`);
        continue;
      }
      await sql`
        UPDATE creators SET avatar_url = ${nextAvatar} WHERE id = ${row.id}
      `;
    }

    console.log(
      `\n${dryRun ? "Would update" : "Updated"} ${mediaUpdated} media row(s), ${creatorsUpdated} creator avatar(s).`,
    );
    console.log(
      "Files in R2 were not deleted or re-uploaded — only DB hostnames changed.",
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
