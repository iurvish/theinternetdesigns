import { Suspense } from "react";
import { PostGrid, PostGridSkeleton } from "@/features/posts/post-grid";
import { searchPosts } from "@/features/posts/queries";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Search
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          {q ? <>Results for &ldquo;{q}&rdquo;</> : "Search"}
        </h1>
      </div>
      <Suspense fallback={<PostGridSkeleton />}>
        <Results q={q} />
      </Suspense>
    </div>
  );
}

async function Results({ q }: { q: string }) {
  if (!q) return null;
  const posts = await searchPosts(q, { limit: 120 });
  return <PostGrid posts={posts} />;
}

export const metadata = { title: "Search" };
