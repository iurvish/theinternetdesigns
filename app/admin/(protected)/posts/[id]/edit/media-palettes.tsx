"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import type { PaletteColor } from "@/lib/media/colors";
import { PaletteEditor } from "@/features/posts/palette-editor";
import { reextractMediaColors } from "../../actions";

export type EditMedia = {
  id: string;
  kind: "image" | "video" | "gif";
  still: string;
  colors: PaletteColor[];
};

/** The whole "Colours" section of the edit form — one palette per media. */
export function MediaPalettes({
  media,
  palettes,
  onChange,
}: {
  media: EditMedia[];
  palettes: Record<string, PaletteColor[]>;
  onChange: (next: Record<string, PaletteColor[]>) => void;
}) {
  if (media.length === 0) return null;
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Colours</span>
        <span className="text-xs text-muted-foreground">
          Extracted at upload — tap a swatch to recolour, or re-extract.
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {media.map((m) => (
          <MediaPaletteCard
            key={m.id}
            media={m}
            colors={palettes[m.id] ?? []}
            onColors={(next) => onChange({ ...palettes, [m.id]: next })}
          />
        ))}
      </div>
    </div>
  );
}

function MediaPaletteCard({
  media,
  colors,
  onColors,
}: {
  media: EditMedia;
  colors: PaletteColor[];
  onColors: (next: PaletteColor[]) => void;
}) {
  const [pending, startTransition] = useTransition();

  function reextract() {
    startTransition(async () => {
      const res = await reextractMediaColors(media.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onColors(res.colors);
      toast.success("Re-extracted from image.");
    });
  }

  return (
    <PaletteEditor
      colors={colors}
      onColors={onColors}
      thumbnailSrc={media.still}
      onReextract={reextract}
      reextracting={pending}
    />
  );
}
