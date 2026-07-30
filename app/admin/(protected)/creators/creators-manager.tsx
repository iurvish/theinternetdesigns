"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { deleteCreator, updateCreator } from "./actions";

type CreatorRow = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  profileUrl: string | null;
  postCount: number;
};

export function CreatorsManager({ initialCreators }: { initialCreators: CreatorRow[] }) {
  const [editing, setEditing] = useState<CreatorRow | null>(null);
  const [deleting, setDeleting] = useState<CreatorRow | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!deleting) return;
    if (confirmText !== deleting.username) {
      toast.error(`Type @${deleting.username} to confirm.`);
      return;
    }
    startTransition(async () => {
      const res = await deleteCreator(deleting.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Creator deleted.");
      setDeleting(null);
      setConfirmText("");
      router.refresh();
    });
  }

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Creators</h1>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        {initialCreators.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No creators yet.</div>
        ) : (
          initialCreators.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 border-b border-border/60 p-3 last:border-b-0"
            >
              <Avatar className="size-10">
                {c.avatarUrl ? <AvatarImage src={c.avatarUrl} alt={c.displayName} /> : null}
                <AvatarFallback>{c.displayName[0] ?? "?"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.displayName}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Link href={`/creator/${c.username}`} className="hover:underline">
                    @{c.username}
                  </Link>
                  <span>·</span>
                  <span>
                    {c.postCount} post{c.postCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              {c.profileUrl ? (
                <Link href={c.profileUrl} target="_blank" rel="noreferrer">
                  <Button variant="ghost" size="icon" title="Open profile">
                    <ExternalLink className="size-4" />
                  </Button>
                </Link>
              ) : null}
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
                onClick={() => {
                  setDeleting(c);
                  setConfirmText("");
                }}
                title="Delete"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>

      <EditDialog
        creator={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(v) => {
          if (!v) {
            setDeleting(null);
            setConfirmText("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete @{deleting?.username}?</DialogTitle>
            <DialogDescription>
              This will also delete all {deleting?.postCount} of their post
              {deleting?.postCount === 1 ? "" : "s"} and remove uploaded files from R2.
              Type <strong>@{deleting?.username}</strong> below to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={`@${deleting?.username ?? ""}`}
            value={confirmText ? "@" + confirmText : ""}
            onChange={(e) => setConfirmText(e.target.value.replace(/^@/, ""))}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleting(null);
                setConfirmText("");
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={pending || confirmText !== deleting?.username}
            >
              {pending ? "Deleting…" : "Delete everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditDialog({
  creator,
  onClose,
  onSaved,
}: {
  creator: CreatorRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(creator?.username ?? "");
  const [displayName, setDisplayName] = useState(creator?.displayName ?? "");
  const [bio, setBio] = useState(creator?.bio ?? "");
  const [profileUrl, setProfileUrl] = useState(creator?.profileUrl ?? "");
  const [pending, startTransition] = useTransition();

  const key = creator?.id ?? "";
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setUsername(creator?.username ?? "");
    setDisplayName(creator?.displayName ?? "");
    setBio(creator?.bio ?? "");
    setProfileUrl(creator?.profileUrl ?? "");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!creator) return;
    startTransition(async () => {
      const res = await updateCreator(creator.id, {
        username,
        displayName,
        bio,
        profileUrl,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved.");
      onSaved();
    });
  }

  return (
    <Dialog open={Boolean(creator)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit creator</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cr-username">Username</Label>
              <Input
                id="cr-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cr-display">Display name</Label>
              <Input
                id="cr-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cr-bio">Bio</Label>
              <Textarea
                id="cr-bio"
                value={bio ?? ""}
                onChange={(e) => setBio(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cr-url">Profile URL</Label>
              <Input
                id="cr-url"
                type="url"
                value={profileUrl ?? ""}
                onChange={(e) => setProfileUrl(e.target.value)}
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
