import { Suspense } from "react";
import { PostGrid, PostGridSkeleton } from "@/features/posts/post-grid";
import { getRecentPosts } from "@/features/posts/queries";
import { SetupRequired } from "@/components/setup-required";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Design inspiration, curated from X
        </h1>
        <p className="text-sm text-muted-foreground">
          The best design posts from designers, engineers, and studios on X.
        </p>
      </div>
      <Suspense fallback={<PostGridSkeleton />}>
        <HomeFeed />
      </Suspense>
    </div>
  );
}

async function HomeFeed() {
  try {
    const posts = await getRecentPosts({ limit: 60 });
    return <PostGrid posts={posts} />;
  } catch (err) {
    return <SetupRequired detail={err instanceof Error ? err.message : String(err)} />;
  }
}
