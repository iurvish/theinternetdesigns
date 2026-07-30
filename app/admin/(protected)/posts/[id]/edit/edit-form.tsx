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
import { updatePost } from "../../actions";

type Category = { id: string; name: string; slug: string };

export function EditPostForm({
  postId,
  initialTitle,
  initialCaption,
  initialPublished,
  initialCategoryIds,
  categories,
}: {
  postId: string;
  initialTitle: string;
  initialCaption: string;
  initialPublished: boolean;
  initialCategoryIds: string[];
  categories: Category[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [caption, setCaption] = useState(initialCaption);
  const [published, setPublished] = useState(initialPublished);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialCategoryIds));
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
        categoryIds: Array.from(selected),
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

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Published (visible on the public site)
        </label>

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
