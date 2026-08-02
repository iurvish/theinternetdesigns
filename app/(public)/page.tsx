import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { getRecentPosts } from "@/features/posts/queries";
import { ExploreFeed } from "@/features/posts/explore-feed";
import { SetupRequired } from "@/components/setup-required";

export default function HomePage() {
  return (
    <div className="flex w-full flex-col items-center bg-[#f7f7f7] px-7">
      <div className="flex w-full flex-1 flex-col items-start px-4 sm:px-10 lg:px-18">
        {/* Hero heading */}
        <div className="flex w-full items-center justify-center border-r border-b border-l border-[#e3e5e8] py-12 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff] sm:py-18 lg:py-24">
          <h1
            className="whitespace-nowrap bg-gradient-to-t from-[#fafafa] to-white bg-clip-text text-center text-5xl font-bold capitalize leading-none tracking-tighter text-transparent [font-family:var(--font-inter)] [word-break:break-word] sm:text-7xl lg:text-9xl"
            style={{
              textShadow:
                "0px 1px 1px rgba(0,0,0,0.15), 0px 1px 1px rgba(10,10,10,0.06), 0px 3px 3px rgba(0,0,0,0.05)",
            }}
          >
            the internet designs
          </h1>
        </div>

        <Suspense fallback={<FeedFallback />}>
          <HomeFeed />
        </Suspense>
      </div>
    </div>
  );
}

async function HomeFeed() {
  try {
    const [posts, cats] = await Promise.all([
      getRecentPosts({ limit: 60 }),
      db
        .select({ slug: categories.slug, name: categories.name })
        .from(categories)
        .orderBy(asc(categories.sortOrder)),
    ]);
    return <ExploreFeed posts={posts} categories={cats} />;
  } catch (err) {
    return (
      <div className="w-full border-r border-b border-l border-[#e3e5e8] p-3.5 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]">
        <SetupRequired detail={err instanceof Error ? err.message : String(err)} />
      </div>
    );
  }
}

function FeedFallback() {
  return (
    <div className="w-full border-r border-b border-l border-[#e3e5e8] p-3.5 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]">
      <div className="columns-2 gap-2.5 md:columns-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className={`mb-2.5 break-inside-avoid animate-pulse rounded-lg bg-[#ececee] ${
              i % 3 === 0 ? "h-64" : i % 3 === 1 ? "h-52" : "h-80"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
