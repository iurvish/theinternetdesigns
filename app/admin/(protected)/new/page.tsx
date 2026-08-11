import { ensurePublicCategories } from "@/lib/db/ensure-public-categories";
import { ensureIndustries } from "@/lib/db/ensure-industries";
import { ensureStyles } from "@/lib/db/ensure-styles";
import { NewPostForm } from "./new-post-form";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const [cats, industryRows, styleRows] = await Promise.all([
    ensurePublicCategories(),
    ensureIndustries(),
    ensureStyles(),
  ]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New post</h1>
      <NewPostForm
        categories={cats}
        industries={industryRows}
        styles={styleRows}
      />
    </div>
  );
}

export const metadata = { title: "New post" };
