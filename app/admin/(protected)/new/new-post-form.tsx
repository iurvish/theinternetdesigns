"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VideoPlayer } from "@/components/video-player";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import {
  fetchBulkPinPreviews,
  fetchBulkPreviews,
  fetchPinPreview,
  fetchPreview,
  publishPinPost,
  publishPost,
} from "./actions";
import type {
  NormalizedTweet,
  TweetMedia,
} from "@/lib/providers/tweet/syndication";
import type { NormalizedPin, PinMedia } from "@/lib/providers/pinterest/types";
import type { PaletteColor } from "@/lib/media/colors";
import { PaletteEditor } from "@/features/posts/palette-editor";
import { INTERACTION_TYPES } from "@/features/posts/interaction-types";
import { PUBLIC_CATEGORY_NAV } from "@/features/posts/public-categories";
import { ChoiceChip, ChoiceChipGroup } from "./admin-choice-chips";

type Category = { id: string; name: string; slug: string };
type Industry = { id: string; name: string; slug: string };
type Style = { id: string; name: string; slug: string };
type Platform = "x" | "pinterest" | "instagram";
type ReadyPlatform = "x" | "pinterest";
/** Shared shape for X + Pinterest preview drafts. */
type SourcePost = NormalizedTweet | NormalizedPin;
type SourceMedia = TweetMedia | PinMedia;
type AiStatus = "idle" | "pending" | "done" | "error";

type DraftItem = {
  source: ReadyPlatform;
  sourceId: string;
  post: SourcePost;
  existing: boolean;
  palettes: PaletteColor[][];
  title: string;
  caption: string;
  /** At most one category id. */
  selectedCats: Set<string>;
  selectedIndustries: Set<string>;
  selectedStyles: Set<string>;
  interaction: string | null;
  featured: boolean;
  hiddenGem: boolean;
  autoplayInFeed: boolean;
  selected: boolean;
  aiStatus: AiStatus;
  aiError: string | null;
  publishStatus: "idle" | "queued" | "publishing" | "failed";
  publishError: string | null;
};

type PublishProgress = {
  total: number;
  published: number;
  failed: number;
  inFlight: number;
  startedAt: number;
  estimatedTotalMs: number;
};

/** Two Vercel invocations at once — each function has its own CPU. */
const PUBLISH_CONCURRENCY = 2;

const PLATFORMS: { id: Platform; label: string; ready: boolean }[] = [
  { id: "x", label: "X", ready: true },
  { id: "pinterest", label: "Pinterest", ready: true },
  { id: "instagram", label: "Instagram", ready: false },
];

export function NewPostForm({
  categories,
  industries,
  styles,
}: {
  categories: Category[];
  industries: Industry[];
  styles: Style[];
}) {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("x");
  const [urlBlob, setUrlBlob] = useState("");
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [errors, setErrors] = useState<{ id: string; error: string }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [previewPending, startPreview] = useTransition();
  const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [aiClassifyPending, setAiClassifyPending] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [aiTagError, setAiTagError] = useState<string | null>(null);
  /** When on, new publishes use the source post date for feed ordering. */
  const [sortBySourceDate, setSortBySourceDate] = useState(false);

  const publicCats = useMemo(() => {
    const order = new Map(PUBLIC_CATEGORY_NAV.map((c, i) => [c.slug, i]));
    return categories
      .filter((c) => order.has(c.slug))
      .sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99));
  }, [categories]);

  const active = drafts.find((d) => d.sourceId === activeId) ?? drafts[0] ?? null;
  const publishPending = publishProgress !== null;
  const isBulk =
    drafts.length > 1 || (publishProgress !== null && publishProgress.total > 1);
  const activeMediaIndex = active
    ? Math.min(mediaIndex, Math.max(active.post.media.length - 1, 0))
    : 0;

  useEffect(() => {
    setMediaIndex(0);
    setAiTagError(null);
  }, [active?.sourceId]);

  useEffect(() => {
    if (!publishProgress) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [publishProgress]);

  function selectPlatform(next: Platform) {
    setPlatform(next);
    setDrafts([]);
    setErrors([]);
    setActiveId(null);
    setUrlBlob("");
    setSortBySourceDate(false);
  }

  function onFetch(e: React.FormEvent) {
    e.preventDefault();
    if (platform === "instagram") {
      toast.error("Instagram bulk upload is coming soon.");
      return;
    }
    const source = platform as ReadyPlatform;
    startPreview(async () => {
      const lines = urlBlob.trim();
      const looksSingle =
        lines.split(/[\s,;]+/).filter(Boolean).length === 1 &&
        !lines.includes("\n");

      if (source === "pinterest") {
        if (looksSingle) {
          const res = await fetchPinPreview(lines);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          if (res.existing) {
            toast.error("This pin is already published.");
            return;
          }
          const draft = toDraft(
            "pinterest",
            res.pin.id,
            res.pin,
            res.existing,
            res.colors,
          );
          setDrafts([draft]);
          setErrors([]);
          setActiveId(draft.sourceId);
          toast.success("Fetched 1 pin.");
          return;
        }

        const res = await fetchBulkPinPreviews(lines);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        const nextDrafts: DraftItem[] = [];
        const nextErrors: { id: string; error: string }[] = [];
        for (const item of res.items) {
          if (!item.ok) {
            nextErrors.push({ id: item.pinId, error: item.error });
            continue;
          }
          if (item.existing) {
            nextErrors.push({ id: item.pinId, error: "Already published." });
            continue;
          }
          nextDrafts.push(
            toDraft("pinterest", item.pinId, item.pin, item.existing, item.colors),
          );
        }
        setDrafts(nextDrafts);
        setErrors(nextErrors);
        setActiveId(nextDrafts[0]?.sourceId ?? null);
        toast.success(
          `Fetched ${nextDrafts.length} pin${nextDrafts.length === 1 ? "" : "s"}${
            nextErrors.length ? ` · ${nextErrors.length} skipped` : ""
          }.`,
        );
        return;
      }

      if (looksSingle) {
        const res = await fetchPreview(lines);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        if (res.existing) {
          toast.error("This tweet is already published.");
          return;
        }
        const draft = toDraft("x", res.tweet.id, res.tweet, res.existing, res.colors);
        setDrafts([draft]);
        setErrors([]);
        setActiveId(draft.sourceId);
        toast.success("Fetched 1 post.");
        return;
      }

      const res = await fetchBulkPreviews(lines);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      const nextDrafts: DraftItem[] = [];
      const nextErrors: { id: string; error: string }[] = [];
      for (const item of res.items) {
        if (!item.ok) {
          nextErrors.push({ id: item.tweetId, error: item.error });
          continue;
        }
        if (item.existing) {
          nextErrors.push({ id: item.tweetId, error: "Already published." });
          continue;
        }
        nextDrafts.push(
          toDraft("x", item.tweetId, item.tweet, item.existing, item.colors),
        );
      }
      setDrafts(nextDrafts);
      setErrors(nextErrors);
      setActiveId(nextDrafts[0]?.sourceId ?? null);
      toast.success(
        `Fetched ${nextDrafts.length} post${nextDrafts.length === 1 ? "" : "s"}${
          nextErrors.length ? ` · ${nextErrors.length} skipped` : ""
        }.`,
      );
    });
  }

  function patchActive(patch: Partial<DraftItem>) {
    if (!active) return;
    setDrafts((prev) =>
      prev.map((d) => (d.sourceId === active.sourceId ? { ...d, ...patch } : d)),
    );
  }

  function toggleCat(id: string) {
    if (!active) return;
    // Category is single-select — tap again to clear.
    const next = active.selectedCats.has(id) ? new Set<string>() : new Set([id]);
    patchActive({ selectedCats: next });
    setAiTagError(null);
  }

  function toggleIndustry(id: string) {
    if (!active) return;
    const next = new Set(active.selectedIndustries);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    patchActive({ selectedIndustries: next });
    setAiTagError(null);
  }

  function toggleStyle(id: string) {
    if (!active) return;
    const next = new Set(active.selectedStyles);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    patchActive({ selectedStyles: next });
    setAiTagError(null);
  }

  function draftPreviewImage(draft: DraftItem): string | null {
    const media = draft.post.media[0];
    if (!media) return null;
    return media.kind === "image" ? media.url : media.posterUrl ?? null;
  }

  async function onAiSuggestAll() {
    const selected = drafts.filter((d) => d.selected);
    const queue = selected.length ? selected : drafts;
    const items = queue
      .map((d) => {
        const imageUrl = draftPreviewImage(d);
        if (!imageUrl) return null;
        return {
          sourceId: d.sourceId,
          imageUrl,
          caption: d.caption.trim() || undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (items.length === 0) {
      setAiTagError(
        "No still images to analyze — need an image or video poster on each post.",
      );
      toast.error("Nothing to analyze with AI.");
      return;
    }

    const skipped = queue.length - items.length;
    setAiTagError(null);
    setAiClassifyPending(true);
    setAiProgress({ done: 0, total: items.length });
    const pendingIds = new Set(items.map((i) => i.sourceId));
    setDrafts((prev) =>
      prev.map((d) =>
        pendingIds.has(d.sourceId)
          ? { ...d, aiStatus: "pending", aiError: null }
          : d,
      ),
    );

    let ok = 0;
    let fail = 0;

    try {
      const res = await fetch("/api/admin/classify-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok || !res.body) {
        const msg =
          (await res.json().catch(() => null))?.error ??
          `AI request failed (${res.status}).`;
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let event: {
            type: string;
            sourceId?: string;
            ok?: boolean;
            error?: string;
            categoryIds?: string[];
            industryIds?: string[];
            styleIds?: string[];
            fail?: number;
          };
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (event.type === "result" && event.sourceId) {
            if (event.ok) {
              ok++;
              setDrafts((prev) =>
                prev.map((d) =>
                  d.sourceId === event.sourceId
                    ? {
                        ...d,
                        selectedCats: new Set(
                          (event.categoryIds ?? []).slice(0, 1),
                        ),
                        selectedIndustries: new Set(event.industryIds ?? []),
                        selectedStyles: new Set(event.styleIds ?? []),
                        aiStatus: "done",
                        aiError: null,
                      }
                    : d,
                ),
              );
            } else {
              fail++;
              setDrafts((prev) =>
                prev.map((d) =>
                  d.sourceId === event.sourceId
                    ? {
                        ...d,
                        aiStatus: "error",
                        aiError: event.error ?? "AI failed.",
                      }
                    : d,
                ),
              );
            }
            setAiProgress((p) =>
              p ? { ...p, done: Math.min(p.done + 1, p.total) } : p,
            );
          }
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "AI classification failed.";
      setAiTagError(message);
      setDrafts((prev) =>
        prev.map((d) =>
          d.aiStatus === "pending"
            ? { ...d, aiStatus: "error", aiError: message }
            : d,
        ),
      );
      toast.error("AI tagging failed.");
      setAiClassifyPending(false);
      setAiProgress(null);
      return;
    }

    setAiClassifyPending(false);
    setAiProgress(null);
    if (skipped > 0) {
      toast.message(
        `Tagged ${ok}, failed ${fail}, skipped ${skipped} (no image).`,
      );
    } else if (fail === 0) {
      toast.success(`AI tagged ${ok} post${ok === 1 ? "" : "s"}.`);
    } else {
      toast.message(`AI tagged ${ok}, failed ${fail}.`);
    }
  }

  function onPublishOne() {
    if (!active) return;
    void runPublishQueue([active]);
  }

  function onPublishSelected() {
    const selected = drafts.filter((d) => d.selected);
    const queue = selected.length ? selected : drafts;
    if (queue.length === 0) return;
    void runPublishQueue(queue);
  }

  async function runPublishQueue(queue: DraftItem[]) {
    const ids = new Set(queue.map((d) => d.sourceId));
    const estimatedTotalMs = queue.reduce(
      (sum, d) => sum + estimateDraftMs(d),
      0,
    );
    setPublishProgress({
      total: queue.length,
      published: 0,
      failed: 0,
      inFlight: 0,
      startedAt: Date.now(),
      estimatedTotalMs,
    });
    setDrafts((prev) =>
      prev.map((d) =>
        ids.has(d.sourceId)
          ? { ...d, publishStatus: "queued", publishError: null }
          : d,
      ),
    );

    const publishedIds = new Set<string>();
    const bulk = queue.length > 1;
    let lastError = "";

    try {
      await mapPool(queue, bulk ? PUBLISH_CONCURRENCY : 1, async (draft) => {
        setPublishProgress((p) =>
          p ? { ...p, inFlight: p.inFlight + 1 } : p,
        );
        setDrafts((prev) =>
          prev.map((d) =>
            d.sourceId === draft.sourceId
              ? { ...d, publishStatus: "publishing", publishError: null }
              : d,
          ),
        );

        const res = await publishDraft(draft, sortBySourceDate);
        if (res.ok) {
          publishedIds.add(draft.sourceId);
          setPublishProgress((p) =>
            p
              ? {
                  ...p,
                  published: p.published + 1,
                  inFlight: Math.max(0, p.inFlight - 1),
                }
              : p,
          );
          setDrafts((prev) =>
            prev.filter((d) => d.sourceId !== draft.sourceId),
          );
          setActiveId((current) =>
            current === draft.sourceId ? null : current,
          );
        } else {
          lastError = res.error;
          setPublishProgress((p) =>
            p
              ? {
                  ...p,
                  failed: p.failed + 1,
                  inFlight: Math.max(0, p.inFlight - 1),
                }
              : p,
          );
          setDrafts((prev) =>
            prev.map((d) =>
              d.sourceId === draft.sourceId
                ? {
                    ...d,
                    publishStatus: "failed",
                    publishError: res.error,
                  }
                : d,
            ),
          );
        }
      });

      const ok = publishedIds.size;
      const fail = queue.length - ok;
      if (queue.length === 1 && fail === 1) {
        toast.error(lastError || "Publish failed.");
      } else if (fail === 0) {
        toast.success(`Published ${ok} post${ok === 1 ? "" : "s"}.`);
      } else {
        toast.message(`Published ${ok}, failed ${fail}.`);
      }
    } finally {
      router.refresh();
      window.setTimeout(() => setPublishProgress(null), 1200);
    }
  }

  const pasteReady = platform === "x" || platform === "pinterest";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectPlatform(p.id)}
              className={cn(
                "rounded-xl border px-3.5 py-2.5 text-sm font-medium tracking-tight transition-[background-color,border-color,color,transform] active:scale-[0.98] motion-reduce:active:scale-100",
                platform === p.id
                  ? "border-[#1f2123] bg-[#1f2123] text-white"
                  : "border-border/80 bg-background text-muted-foreground hover:border-foreground/25 hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {p.label}
              {!p.ready ? (
                <span className="ml-1.5 text-[11px] opacity-70">Soon</span>
              ) : null}
            </button>
          ))}
        </div>

        {pasteReady ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                1. Paste {platform === "x" ? "X" : "Pinterest"} URLs
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {platform === "x"
                  ? "One URL for a single post, or paste 10–20 URLs (one per line) for bulk fetch."
                  : "Paste one or many pin URLs (pinterest.com/pin/… or pin.it). Bulk accepts up to 25."}
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={onFetch} className="flex flex-col gap-3">
                <Textarea
                  placeholder={
                    platform === "x"
                      ? `https://x.com/user/status/123…\nhttps://x.com/user/status/456…`
                      : `https://www.pinterest.com/pin/1234567890/\nhttps://pin.it/…`
                  }
                  value={urlBlob}
                  onChange={(e) => setUrlBlob(e.target.value)}
                  disabled={previewPending}
                  required
                  rows={6}
                  className="font-mono text-sm"
                />
                <label className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={sortBySourceDate}
                    onChange={(e) => setSortBySourceDate(e.target.checked)}
                    disabled={previewPending}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    <span className="font-medium">
                      Sort by original post date
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      When enabled, each post uses its{" "}
                      {platform === "x" ? "X" : "Pinterest"} publish date in the
                      feed (newest first). When off, posts sort by import time.
                      Only affects posts published in this session.
                    </span>
                  </span>
                </label>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={previewPending || !urlBlob.trim()}
                  >
                    {previewPending ? "Fetching…" : "Fetch"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-base font-medium tracking-tight">
                {PLATFORMS.find((p) => p.id === platform)?.label} bulk upload
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Coming soon — paste multiple {platform} URLs here once the
                provider is wired.
              </p>
            </CardContent>
          </Card>
        )}

        {errors.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-destructive">
                Skipped ({errors.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {errors.map((e) => (
                <div key={e.id} className="flex justify-between gap-3">
                  <span className="font-mono text-xs">{e.id}</span>
                  <span>{e.error}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {publishProgress ? (
        <PublishProgressCard progress={publishProgress} now={now} />
      ) : null}

      {drafts.length > 0 && active ? (
        <div
          className={cn(
            "grid gap-4",
            isBulk && "lg:grid-cols-[200px_minmax(0,1fr)]",
          )}
        >
          {isBulk ? (
            <Card className="h-fit lg:sticky lg:top-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Queue ({drafts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex max-h-[min(70vh,560px)] flex-col gap-1 overflow-y-auto">
                {drafts.map((d) => (
                  <button
                    key={d.sourceId}
                    type="button"
                    onClick={() => setActiveId(d.sourceId)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                      d.sourceId === active.sourceId
                        ? "bg-[#1f2123] text-white"
                        : "hover:bg-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={d.selected}
                      disabled={publishPending}
                      onChange={(e) => {
                        e.stopPropagation();
                        setDrafts((prev) =>
                          prev.map((x) =>
                            x.sourceId === d.sourceId
                              ? { ...x, selected: e.target.checked }
                              : x,
                          ),
                        );
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                    />
                    <span className="truncate">@{d.post.creator.username}</span>
                    {d.publishStatus === "publishing" ? (
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-[10px]",
                          d.sourceId === active.sourceId
                            ? "text-white/70"
                            : "text-muted-foreground",
                        )}
                      >
                        Publishing…
                      </span>
                    ) : d.publishStatus === "queued" ? (
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-[10px]",
                          d.sourceId === active.sourceId
                            ? "text-white/70"
                            : "text-muted-foreground",
                        )}
                      >
                        Queued
                      </span>
                    ) : d.publishStatus === "failed" ? (
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-[10px]",
                          d.sourceId === active.sourceId
                            ? "text-red-200"
                            : "text-destructive",
                        )}
                      >
                        Failed
                      </span>
                    ) : d.aiStatus === "pending" ? (
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-[10px]",
                          d.sourceId === active.sourceId
                            ? "text-white/70"
                            : "text-muted-foreground",
                        )}
                      >
                        AI…
                      </span>
                    ) : d.aiStatus === "done" ? (
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-[10px]",
                          d.sourceId === active.sourceId
                            ? "text-emerald-200"
                            : "text-emerald-600",
                        )}
                      >
                        Tagged
                      </span>
                    ) : d.aiStatus === "error" ? (
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-[10px]",
                          d.sourceId === active.sourceId
                            ? "text-red-200"
                            : "text-destructive",
                        )}
                      >
                        Failed
                      </span>
                    ) : sortBySourceDate ? (
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-[10px] tabular-nums",
                          d.sourceId === active.sourceId
                            ? "text-white/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatSourceDate(d.post.createdAt)}
                      </span>
                    ) : null}
                  </button>
                ))}
                <Button
                  variant="outline"
                  className="mt-3 gap-1.5"
                  onClick={onAiSuggestAll}
                  disabled={aiClassifyPending || publishPending}
                >
                  <Sparkles className="size-3.5" aria-hidden />
                  {aiClassifyPending && aiProgress
                    ? `AI ${aiProgress.done}/${aiProgress.total}…`
                    : `Suggest with AI${
                        drafts.some((d) => d.selected)
                          ? ` (${drafts.filter((d) => d.selected).length})`
                          : drafts.length > 1
                            ? ` (${drafts.length})`
                            : ""
                      }`}
                </Button>
                <Button
                  className="mt-2"
                  onClick={onPublishSelected}
                  disabled={publishPending || aiClassifyPending}
                >
                  {publishProgress
                    ? `Publishing ${publishProgress.published + publishProgress.failed}/${publishProgress.total}…`
                    : `Publish ${
                        drafts.some((d) => d.selected)
                          ? drafts.filter((d) => d.selected).length
                          : drafts.length
                      }`}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card className="min-w-0">
            <CardHeader className="border-b border-border/50 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">2. Preview & publish</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review media and metadata, then publish.
                  </p>
                </div>
                <AuthorMeta
                  creator={active.post.creator}
                  mediaCount={active.post.media.length}
                  sourceDate={active.post.createdAt}
                  sortBySourceDate={sortBySourceDate}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
                <div className="flex flex-col gap-4 lg:sticky lg:top-4">
                  <PreviewMediaGallery
                    source={active.source}
                    sourceId={active.post.id}
                    media={active.post.media}
                    selectedIndex={activeMediaIndex}
                    onSelect={setMediaIndex}
                  />
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Label>
                        Colours
                        {active.post.media.length > 1
                          ? ` · ${activeMediaIndex + 1}/${active.post.media.length}`
                          : null}
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        Tap a swatch to recolour
                      </span>
                    </div>
                    <PaletteEditor
                      colors={active.palettes[activeMediaIndex] ?? []}
                      onColors={(next) => {
                        patchActive({
                          palettes: active.palettes.map((c, idx) =>
                            idx === activeMediaIndex ? next : c,
                          ),
                        });
                      }}
                      thumbnailSrc={(() => {
                        const m = active.post.media[activeMediaIndex];
                        if (!m) return null;
                        return m.kind === "image" ? m.url : m.posterUrl;
                      })()}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="title">Title (optional)</Label>
                    <Input
                      id="title"
                      value={active.title}
                      onChange={(e) => patchActive({ title: e.target.value })}
                      placeholder="Short title shown on cards"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="caption">Caption</Label>
                    <Textarea
                      id="caption"
                      value={active.caption}
                      onChange={(e) => patchActive({ caption: e.target.value })}
                      rows={5}
                    />
                  </div>

                  <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/30 p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">AI tag suggestions</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          One button tags every selected post (or all in the queue).
                          Results stream in as each post finishes — category is
                          single-select; industries and styles can be multiple.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        disabled={aiClassifyPending || publishPending}
                        onClick={onAiSuggestAll}
                      >
                        <Sparkles className="size-3.5" aria-hidden />
                        {aiClassifyPending && aiProgress
                          ? `AI ${aiProgress.done}/${aiProgress.total}…`
                          : drafts.length > 1
                            ? "Suggest all with AI"
                            : "Suggest with AI"}
                      </Button>
                    </div>
                    {aiProgress ? (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Tagging {aiProgress.done} of {aiProgress.total}…
                      </p>
                    ) : null}
                    {active.aiError ? (
                      <p
                        role="alert"
                        className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                      >
                        {active.aiError}
                      </p>
                    ) : null}
                    {aiTagError ? (
                      <p
                        role="alert"
                        className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                      >
                        {aiTagError}
                      </p>
                    ) : null}
                  </div>

                  <ChoiceChipGroup
                    label="Category"
                    hint="Pick one"
                  >
                    {publicCats.map((c) => (
                      <ChoiceChip
                        key={c.id}
                        label={c.name}
                        active={active.selectedCats.has(c.id)}
                        onClick={() => toggleCat(c.id)}
                      />
                    ))}
                  </ChoiceChipGroup>

                  <ChoiceChipGroup
                    label="Industry"
                    hint="Admin only — not on public nav"
                  >
                    {industries.map((i) => (
                      <ChoiceChip
                        key={i.id}
                        label={i.name}
                        active={active.selectedIndustries.has(i.id)}
                        onClick={() => toggleIndustry(i.id)}
                      />
                    ))}
                  </ChoiceChipGroup>

                  <ChoiceChipGroup
                    label="Style"
                    hint="Visual look — Light, Dark, Minimal…"
                  >
                    {styles.map((s) => (
                      <ChoiceChip
                        key={s.id}
                        label={s.name}
                        active={active.selectedStyles.has(s.id)}
                        onClick={() => toggleStyle(s.id)}
                      />
                    ))}
                  </ChoiceChipGroup>

                  <ChoiceChipGroup
                    label="Interaction"
                    hint="Side panel label"
                  >
                    {INTERACTION_TYPES.map((t) => (
                      <ChoiceChip
                        key={t}
                        label={t}
                        active={active.interaction === t}
                        onClick={() =>
                          patchActive({
                            interaction: active.interaction === t ? null : t,
                          })
                        }
                      />
                    ))}
                  </ChoiceChipGroup>

                  <div className="grid gap-2.5">
                    <Label>Feed placement</Label>
                    <div className="flex flex-wrap gap-2.5">
                      <ChoiceChip
                        label="Featured"
                        active={active.featured}
                        onClick={() =>
                          patchActive({ featured: !active.featured })
                        }
                      />
                      <ChoiceChip
                        label="Hidden gem"
                        active={active.hiddenGem}
                        onClick={() =>
                          patchActive({ hiddenGem: !active.hiddenGem })
                        }
                      />
                    </div>
                  </div>

                  {active.post.media.some(
                    (m) => m.kind === "video" || m.kind === "gif",
                  ) ? (
                    <label className="flex items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={active.autoplayInFeed}
                        onChange={(e) =>
                          patchActive({ autoplayInFeed: e.target.checked })
                        }
                      />
                      Autoplay video in feed
                    </label>
                  ) : null}

                  {sortBySourceDate && !active.post.createdAt ? (
                    <p
                      role="status"
                      className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
                    >
                      No original publish date from{" "}
                      {active.source === "x" ? "X" : "Pinterest"} — this post
                      will sort by import time.
                    </p>
                  ) : null}

                  {active.publishError ? (
                    <p
                      role="alert"
                      className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                    >
                      {active.publishError}
                    </p>
                  ) : null}

                  <div className="sticky bottom-0 z-10 mt-1 flex justify-end gap-2 border-t border-border/60 bg-card/95 py-4 backdrop-blur-sm supports-backdrop-filter:bg-card/80">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDrafts([]);
                        setErrors([]);
                        setActiveId(null);
                        setUrlBlob("");
                      }}
                      disabled={publishPending}
                    >
                      Clear
                    </Button>
                    <Button onClick={onPublishOne} disabled={publishPending || aiClassifyPending}>
                      {publishProgress && publishProgress.total === 1
                        ? "Publishing…"
                        : "Publish this"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function formatSourceDate(iso: string | null): string {
  if (!iso) return "No date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Invalid date";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDraft(
  source: ReadyPlatform,
  sourceId: string,
  post: SourcePost,
  existing: boolean,
  colors: PaletteColor[][],
): DraftItem {
  return {
    source,
    sourceId,
    post,
    existing,
    palettes: colors,
    title: "",
    caption: post.text,
    selectedCats: new Set(),
    selectedIndustries: new Set(),
    selectedStyles: new Set(),
    interaction: null,
    featured: false,
    hiddenGem: false,
    // Default off — autoplay × many users = full video downloads (R2 Class B).
    autoplayInFeed: false,
    selected: true,
    aiStatus: "idle",
    aiError: null,
    publishStatus: "idle",
    publishError: null,
  };
}

function AuthorMeta({
  creator,
  mediaCount,
  sourceDate,
  sortBySourceDate,
}: {
  creator: SourcePost["creator"];
  mediaCount: number;
  sourceDate: string | null;
  sortBySourceDate: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/40 px-2.5 py-2">
      {creator.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={creator.avatarUrl}
          alt=""
          className="size-8 shrink-0 rounded-full outline outline-1 outline-black/10"
        />
      ) : (
        <div className="size-8 shrink-0 rounded-full bg-muted" />
      )}
      <div className="min-w-0 text-sm leading-tight">
        <div className="truncate font-medium tracking-tight">
          {creator.displayName}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          @{creator.username}
          <span className="mx-1.5 text-border">·</span>
          {mediaCount} media
          {sortBySourceDate ? (
            <>
              <span className="mx-1.5 text-border">·</span>
              <span className="tabular-nums">
                {formatSourceDate(sourceDate)}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PreviewMediaGallery({
  source,
  sourceId,
  media,
  selectedIndex,
  onSelect,
}: {
  source: ReadyPlatform;
  sourceId: string;
  media: SourceMedia[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  if (media.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 text-sm text-muted-foreground">
        No media on this post
      </div>
    );
  }

  const selected = media[selectedIndex] ?? media[0]!;
  /** 2–4 items: compact 2-col grid; 5+: horizontal strip with peek. */
  const useGrid = media.length >= 2 && media.length <= 4;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl bg-muted outline outline-1 outline-black/10">
        <PreviewMediaItem
          source={source}
          sourceId={sourceId}
          media={selected}
          index={selectedIndex}
        />
      </div>

      {media.length > 1 ? (
        useGrid ? (
          <div
            className={cn(
              "grid gap-2",
              media.length === 2 && "max-w-[11rem] grid-cols-2",
              media.length === 3 && "max-w-[16.5rem] grid-cols-3",
              media.length === 4 && "max-w-[11rem] grid-cols-2",
            )}
          >
            {media.map((m, i) => (
              <MediaThumb
                key={i}
                media={m}
                active={i === selectedIndex}
                label={`${i + 1}`}
                onClick={() => onSelect(i)}
              />
            ))}
          </div>
        ) : (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
            {media.map((m, i) => (
              <MediaThumb
                key={i}
                media={m}
                active={i === selectedIndex}
                label={`${i + 1}`}
                onClick={() => onSelect(i)}
                className="w-[4.5rem] shrink-0"
              />
            ))}
            <div className="w-4 shrink-0" aria-hidden />
          </div>
        )
      ) : null}
    </div>
  );
}

function PreviewMediaItem({
  source,
  sourceId,
  media,
  index,
}: {
  source: ReadyPlatform;
  sourceId: string;
  media: SourceMedia;
  index: number;
}) {
  if (media.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={media.url}
        alt=""
        className="mx-auto block max-h-[min(62vh,560px)] w-full object-contain"
      />
    );
  }

  const previewBase =
    source === "pinterest" ? "/api/pin-preview" : "/api/tweet-preview";

  return (
    <VideoPlayer
      src={`${previewBase}/${sourceId}/${index}`}
      poster={media.posterUrl}
      mode={media.kind === "gif" ? "gif" : "video"}
      className="max-h-[min(62vh,560px)] rounded-none"
    />
  );
}

function MediaThumb({
  media,
  active,
  label,
  onClick,
  className,
}: {
  media: SourceMedia;
  active: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  const src = media.kind === "image" ? media.url : media.posterUrl;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Media ${label}`}
      aria-pressed={active}
      className={cn(
        "relative aspect-square overflow-hidden rounded-lg bg-muted outline outline-1 transition-[outline-color,transform] active:scale-[0.96] motion-reduce:active:scale-100",
        active
          ? "outline-2 outline-[#1f2123]"
          : "outline-black/10 hover:outline-foreground/25",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
          {media.kind}
        </div>
      )}
      {media.kind !== "image" ? (
        <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-white">
          {media.kind === "gif" ? "GIF" : "Video"}
        </span>
      ) : null}
    </button>
  );
}

async function publishDraft(
  draft: DraftItem,
  sortBySourceDate: boolean,
) {
  const shared = {
    title: draft.title,
    caption: draft.caption,
    categoryIds: Array.from(draft.selectedCats),
    industryIds: Array.from(draft.selectedIndustries),
    styleIds: Array.from(draft.selectedStyles),
    mediaColors: draft.palettes,
    autoplayInFeed: draft.autoplayInFeed,
    featured: draft.featured,
    hiddenGem: draft.hiddenGem,
    interaction: draft.interaction,
    sortBySourceDate,
  };
  if (draft.source === "pinterest") {
    return publishPinPost({ pinId: draft.sourceId, ...shared });
  }
  return publishPost({ tweetId: draft.sourceId, ...shared });
}

function estimateDraftMs(draft: DraftItem): number {
  let ms = 3000;
  for (const m of draft.post.media) {
    ms += m.kind === "image" ? 5000 : 14000;
  }
  return ms;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function PublishProgressCard({
  progress,
  now,
}: {
  progress: PublishProgress;
  now: number;
}) {
  const finished = progress.published + progress.failed;
  const pending = Math.max(0, progress.total - finished);
  const elapsedMs = Math.max(0, now - progress.startedAt);
  const pct =
    progress.total === 0 ? 0 : Math.round((finished / progress.total) * 100);
  const etaMs =
    finished > 0
      ? (elapsedMs / finished) * pending
      : Math.max(0, progress.estimatedTotalMs - elapsedMs);
  const remainingLabel =
    pending === 0
      ? "Finishing up…"
      : finished === 0
        ? `About ${formatDuration(etaMs)} remaining`
        : `~${formatDuration(etaMs)} left`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Publishing</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
        >
          <p className="font-medium tabular-nums tracking-tight">
            {finished} of {progress.total} done
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Elapsed {formatDuration(elapsedMs)}
            <span className="mx-1.5 text-border">·</span>
            {remainingLabel}
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={finished}
          aria-label="Publish progress"
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-[#1f2123] transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          Published {progress.published}
          <span className="mx-1.5 text-border">·</span>
          Pending {pending}
          {progress.inFlight > 0 ? (
            <>
              <span className="mx-1.5 text-border">·</span>
              Uploading {progress.inFlight}
            </>
          ) : null}
          {progress.failed > 0 ? (
            <>
              <span className="mx-1.5 text-border">·</span>
              <span className="text-destructive">Failed {progress.failed}</span>
            </>
          ) : null}
        </p>
      </CardContent>
    </Card>
  );
}
