"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createCategory, deleteCategory, updateCategory } from "./actions";

type Cat = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  postCount: number;
};

export function CategoriesManager({ initialCategories }: { initialCategories: Cat[] }) {
  const [editing, setEditing] = useState<Cat | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Cat | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteCategory(deleting.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Category deleted.");
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 size-4" />
          New category
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        {initialCategories.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No categories yet.</div>
        ) : (
          initialCategories.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 border-b border-border/60 p-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {c.name}
                  <span className="text-xs font-normal text-muted-foreground">
                    /{c.slug}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.postCount} post{c.postCount === 1 ? "" : "s"} · sort {c.sortOrder}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditing(c)}
                title="Edit"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleting(c)}
                title="Delete"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>

      <CategoryDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          router.refresh();
        }}
      />
      <CategoryDialog
        open={Boolean(editing)}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <Dialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{deleting?.name}&quot;?</DialogTitle>
            <DialogDescription>
              This cannot be undone. If any posts still use this category, deletion
              will fail.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: Cat | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [pending, startTransition] = useTransition();

  // Reset when dialog reopens with different initial data.
  const key = initial?.id ?? "new";
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setName(initial?.name ?? "");
    setSlug(initial?.slug ?? "");
    setDescription(initial?.description ?? "");
    setSortOrder(String(initial?.sortOrder ?? 0));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const payload = {
        name,
        slug: slug || name,
        description,
        sortOrder: Number(sortOrder) || 0,
      };
      const res = initial
        ? await updateCategory(initial.id, payload)
        : await createCategory(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(initial ? "Updated." : "Created.");
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{initial ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-slug">Slug</Label>
              <Input
                id="cat-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="auto from name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-sort">Sort order</Label>
              <Input
                id="cat-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
