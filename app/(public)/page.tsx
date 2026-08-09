import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { getRecentPosts } from "@/features/posts/queries";
import type { PostListItem } from "@/features/posts/queries";
import { ExploreFeed, type PostsResult } from "@/features/posts/explore-feed";
import { PUBLIC_CATEGORY_NAV } from "@/features/posts/public-categories";
import { SetupRequired } from "@/components/setup-required";
import { PaperCurl } from "@/components/paper-curl";
import { HeroWordmark } from "@/components/hero-wordmark";

export default function HomePage() {
  return (
    <div className="flex w-full flex-col items-center bg-[#f7f7f7] px-1 sm:px-7">
      <div className="flex w-full flex-1 flex-col items-start px-1 sm:px-10 lg:px-18">
        {/* Hero heading */}
        <div className="relative flex w-full items-center justify-center border-r border-b border-l border-[#e3e5e8] pb-20 pt-14 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff] [container-type:inline-size] sm:py-18 lg:py-24">
          {/* Decorative paper-curl at the sheet's top-right corner */}
          <PaperCurl />
          {/* Size scales to the bordered box's own width (container query units),
              so the single line can never overflow the left/right borders. */}
          <HeroWordmark />
        </div>

        <HomeShell />
      </div>
    </div>
  );
}

/**
 * Categories are awaited (fast) so the filter bar is in the initial HTML and
 * never blanks out on refresh; the slower posts query is passed down as a
 * promise and streamed into the grid via a Suspense boundary inside ExploreFeed.
 */
async function HomeShell() {
  try {
    // Sanity check — categories table reachable before streaming posts.
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

  const postsPromise: Promise<PostsResult> = getRecentPosts({ limit: 24 })
    .then((posts) => ({ posts, error: null }))
    .catch((err) => ({
      posts: [] as PostListItem[],
      error: err instanceof Error ? err.message : String(err),
    }));

  return (
    <ExploreFeed categories={PUBLIC_CATEGORY_NAV} postsPromise={postsPromise} />
  );
}
