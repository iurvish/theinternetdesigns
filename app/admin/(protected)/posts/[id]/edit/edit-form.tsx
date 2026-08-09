"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PaletteColor } from "@/lib/media/colors";
import { updatePost } from "../../actions";
import { MediaPalettes, type EditMedia } from "./media-palettes";

type Category = { id: string; name: string; slug: string };

export function EditPostForm({
  postId,
  initialTitle,
  initialCaption,
  initialPublished,
  initialAutoplayInFeed,
  initialFeatured,
  initialHiddenGem,
  hasVideo,
  initialCategoryIds,
  categories,
  media,
}: {
  postId: string;
  initialTitle: string;
  initialCaption: string;
  initialPublished: boolean;
  initialAutoplayInFeed: boolean;
  initialFeatured: boolean;
  initialHiddenGem: boolean;
  hasVideo: boolean;
  initialCategoryIds: string[];
  categories: Category[];
  media: EditMedia[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [caption, setCaption] = useState(initialCaption);
  const [published, setPublished] = useState(initialPublished);
  const [autoplayInFeed, setAutoplayInFeed] = useState(initialAutoplayInFeed);
  const [featured, setFeatured] = useState(initialFeatured);
  const [hiddenGem, setHiddenGem] = useState(initialHiddenGem);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialCategoryIds));
  const [palettes, setPalettes] = useState<Record<string, PaletteColor[]>>(() =>
    Object.fromEntries(media.map((m) => [m.id, m.colors])),
  );
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSave() {
    startTransition(async () => {
      const res = await updatePost({
        postId,
        title,
        caption,
        published,
        autoplayInFeed,
        featured,
        hiddenGem,
        categoryIds: Array.from(selected),
        mediaColors: media.map((m) => ({
          mediaId: m.id,
          colors: palettes[m.id] ?? [],
        })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved.");
      router.push("/admin/posts");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6">
        <div className="grid gap-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="caption">Caption</Label>
          <Textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
          />
        </div>

        <div className="grid gap-2">
          <Label>Categories</Label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="focus:outline-none"
                >
                  <Badge
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer"
                  >
                    {c.name}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        <MediaPalettes media={media} palettes={palettes} onChange={setPalettes} />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Published (visible on the public site)
        </label>

        <div className="grid gap-2">
          <Label>Feed placement</Label>
          <p className="text-xs text-muted-foreground">
            Optional — a post can appear in both Featured and Hidden Gems.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
              />
              Featured
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hiddenGem}
                onChange={(e) => setHiddenGem(e.target.checked)}
              />
              Hidden gem
            </label>
          </div>
        </div>

        {hasVideo ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoplayInFeed}
              onChange={(e) => setAutoplayInFeed(e.target.checked)}
            />
            Autoplay video in feed (otherwise it plays on hover)
          </label>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
          <Button
            variant="outline"
            onClick={() => router.push("/admin/posts")}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
