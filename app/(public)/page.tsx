import { Suspense } from "react";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { getRecentPosts } from "@/features/posts/queries";
import type { PostListItem } from "@/features/posts/queries";
import {
  ExploreFeed,
  ExploreFeedFallback,
} from "@/features/posts/explore-feed";
import { PUBLIC_CATEGORY_NAV } from "@/features/posts/public-categories";
import { SetupRequired } from "@/components/setup-required";

export default function HomePage() {
  return (
    <Suspense fallback={<ExploreFeedFallback />}>
      <HomeShell />
    </Suspense>
  );
}

/**
 * Await the first feed page on the server and pass resolved posts into the
 * client explorer. Streaming a Promise into a client Suspense boundary was
 * re-showing GridSkeleton on hydration / RSC refresh even after posts had
 * already painted — awaiting here restores the pre-regression behaviour.
 */
async function HomeShell() {
  try {
    // Sanity check — categories table reachable before loading posts.
    await db.select({ slug: categories.slug }).from(categories).limit(1);
  } catch (err) {
    return (
      <div className="w-full p-4">
        <SetupRequired
          detail={err instanceof Error ? err.message : String(err)}
        />
      </div>
    );
  }

  let initialPosts: PostListItem[] = [];
  let error: string | null = null;
  try {
    initialPosts = (await getRecentPosts({ limit: 24 })) ?? [];
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <ExploreFeed
      categories={PUBLIC_CATEGORY_NAV}
      initialPosts={initialPosts}
      error={error}
    />
  );
}
