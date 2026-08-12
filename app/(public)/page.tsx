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
import { PaperCurl } from "@/components/paper-curl";
import { HeroWordmark } from "@/components/hero-wordmark";
import { homePageMetadata } from "@/lib/site-config";

export const metadata = homePageMetadata;

export default function HomePage() {
  return (
    <div className="flex w-full flex-1 flex-col items-center bg-[#f7f7f7] px-1 sm:px-7">
      <div className="flex w-full flex-1 flex-col items-start px-1 sm:px-10 lg:px-18">
        {/* Hero heading */}
        <div className="relative flex w-full items-center justify-center border-r border-b border-l border-[#e3e5e8] pb-20 pt-14 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff] [container-type:inline-size] sm:py-18 lg:py-24">
          {/* Decorative paper-curl at the sheet's top-right corner */}
          <PaperCurl />
          {/* Size scales to the bordered box's own width (container query units),
              so the single line can never overflow the left/right borders. */}
          <HeroWordmark />
        </div>

        <Suspense fallback={<ExploreFeedFallback />}>
          <HomeShell />
        </Suspense>
      </div>
    </div>
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
      <div className="w-full border-r border-b border-l border-[#e3e5e8] p-3.5 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]">
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
