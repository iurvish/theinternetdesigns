import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { getRecentPosts } from "@/features/posts/queries";
import type { PostListItem } from "@/features/posts/queries";
import { ExploreFeed, type PostsResult } from "@/features/posts/explore-feed";
import { SetupRequired } from "@/components/setup-required";

export default function HomePage() {
  return (
    <div className="flex w-full flex-col items-center bg-[#f7f7f7] px-7">
      <div className="flex w-full flex-1 flex-col items-start px-4 sm:px-10 lg:px-18">
        {/* Hero heading */}
        <div className="flex w-full items-center justify-center border-r border-b border-l border-[#e3e5e8] py-12 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff] [container-type:inline-size] sm:py-18 lg:py-24">
          {/* Size scales to the bordered box's own width (container query units),
              so the single line can never overflow the left/right borders. */}
          <h1
            className="whitespace-nowrap bg-gradient-to-t from-[#fafafa] to-white bg-clip-text text-center text-[clamp(1.75rem,8cqw,8rem)] font-bold capitalize leading-none tracking-tighter text-transparent [font-family:var(--font-inter)]"
            style={{
              textShadow:
                "0px 1px 1px rgba(0,0,0,0.15), 0px 1px 1px rgba(10,10,10,0.06), 0px 3px 3px rgba(0,0,0,0.05)",
            }}
          >
            the internet designs
          </h1>
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
  let cats: { slug: string; name: string }[];
  try {
    cats = await db
      .select({ slug: categories.slug, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.sortOrder));
  } catch (err) {
    return (
      <div className="w-full border-r border-b border-l border-[#e3e5e8] p-3.5 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]">
        <SetupRequired detail={err instanceof Error ? err.message : String(err)} />
      </div>
    );
  }

  const postsPromise: Promise<PostsResult> = getRecentPosts({ limit: 60 })
    .then((posts) => ({ posts, error: null }))
    .catch((err) => ({
      posts: [] as PostListItem[],
      error: err instanceof Error ? err.message : String(err),
    }));

  return <ExploreFeed categories={cats} postsPromise={postsPromise} />;
}
