import { ensurePublicCategories } from "@/lib/db/ensure-public-categories";
import { NewPostForm } from "./new-post-form";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const cats = await ensurePublicCategories();

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New post</h1>
      <NewPostForm categories={cats} />
    </div>
  );
}

export const metadata = { title: "New post" };
