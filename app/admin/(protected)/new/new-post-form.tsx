"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VideoPlayer } from "@/components/video-player";
import { fetchPreview, publishPost } from "./actions";
import type { NormalizedTweet } from "@/lib/providers/tweet/syndication";

type Category = { id: string; name: string; slug: string };

export function NewPostForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [tweet, setTweet] = useState<NormalizedTweet | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [previewPending, startPreview] = useTransition();
  const [publishPending, startPublish] = useTransition();

  function onFetch(e: React.FormEvent) {
    e.preventDefault();
    startPreview(async () => {
      const res = await fetchPreview(url);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.existing) {
        toast.error("This tweet is already published.");
        return;
      }
      setTweet(res.tweet);
      setCaption(res.tweet.text);
      setTitle("");
      setSelectedCats(new Set());
    });
  }

  function toggleCategory(id: string) {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onPublish() {
    if (!tweet) return;
    startPublish(async () => {
      const res = await publishPost({
        tweetId: tweet.id,
        title,
        caption,
        categoryIds: Array.from(selectedCats),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Published.");
      router.push(`/post/${res.postId}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Paste tweet URL</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onFetch} className="flex gap-2">
            <Input
              placeholder="https://x.com/username/status/1234567890"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={previewPending}
              required
            />
            <Button type="submit" disabled={previewPending || !url}>
              {previewPending ? "Fetching…" : "Fetch"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {tweet ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Preview & publish</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              {tweet.creator.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tweet.creator.avatarUrl}
                  alt=""
                  className="h-10 w-10 rounded-full"
                />
              ) : null}
              <div className="text-sm">
                <div className="font-medium">{tweet.creator.displayName}</div>
                <div className="text-muted-foreground">@{tweet.creator.username}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="text-xs text-muted-foreground">
                {tweet.media.length} media item{tweet.media.length === 1 ? "" : "s"} — preview before publishing
              </div>
              {tweet.media.map((m, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-lg border border-border/60 bg-muted"
                >
                  {m.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.url}
                      alt=""
                      className="block h-auto w-full object-contain"
                    />
                  ) : (
                    <VideoPlayer
                      src={`/api/tweet-preview/${tweet.id}/${i}`}
                      poster={m.posterUrl}
                      mode={m.kind === "gif" ? "gif" : "video"}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short title shown on cards"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="caption">Caption</Label>
              <Textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
              />
            </div>

            <div className="grid gap-2">
              <Label>Categories</Label>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const active = selectedCats.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCategory(c.id)}
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

            <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setTweet(null);
                  setUrl("");
                }}
                disabled={publishPending}
              >
                Cancel
              </Button>
              <Button onClick={onPublish} disabled={publishPending}>
                {publishPending ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
