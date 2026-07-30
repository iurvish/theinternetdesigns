"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { deletePost, togglePublished } from "./actions";

export function PostRowActions({
  postId,
  published,
}: {
  postId: string;
  published: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      const res = await deletePost(postId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Post deleted.");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  function onToggle() {
    startTransition(async () => {
      const res = await togglePublished(postId, !published);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(!published ? "Published." : "Unpublished.");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        disabled={pending}
        title={published ? "Unpublish" : "Publish"}
      >
        {published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </Button>
      <Link href={`/admin/posts/${postId}/edit`}>
        <Button variant="ghost" size="icon" title="Edit">
          <Pencil className="size-4" />
        </Button>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
        title="Delete"
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>
              This removes the post, its media rows, and the uploaded files from R2.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
