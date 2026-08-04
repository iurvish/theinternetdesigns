import { Suspense } from "react";
import { PostGrid, PostGridSkeleton } from "@/features/posts/post-grid";
import { searchPosts, searchPostsByColors } from "@/features/posts/queries";

/** `#rrggbb` values, comma-separated in the URL. */
function parseColors(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((c) => (c.startsWith("#") ? c : `#${c}`))
    .filter((c) => /^#[0-9a-f]{6}$/i.test(c))
    .slice(0, 5);
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; colors?: string }>;
}) {
  const { q = "", colors: colorsRaw } = await searchParams;
  const colors = parseColors(colorsRaw);
  const byColor = colors.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Search
        </span>
        {byColor ? (
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Designs by colour
            </h1>
            <span className="flex items-center">
              {colors.map((c, i) => (
                <span
                  key={c}
                  className="size-5 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: c, marginLeft: i === 0 ? 0 : -6 }}
                />
              ))}
            </span>
          </div>
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">
            {q ? <>Results for &ldquo;{q}&rdquo;</> : "Search"}
          </h1>
        )}
      </div>
      <Suspense fallback={<PostGridSkeleton />}>
        <Results q={q} colors={colors} />
      </Suspense>
    </div>
  );
}

async function Results({ q, colors }: { q: string; colors: string[] }) {
  if (colors.length > 0) {
    const posts = await searchPostsByColors(colors, { limit: 120 });
    return <PostGrid posts={posts} />;
  }
  if (!q) return null;
  const posts = await searchPosts(q, { limit: 120 });
  return <PostGrid posts={posts} />;
}

export const metadata = { title: "Search" };
