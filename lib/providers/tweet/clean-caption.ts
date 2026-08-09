/**
 * Twitter/X appends a media shortlink (https://t.co/…) to tweet text.
 * Use display_text_range / media entities when available; otherwise drop the
 * final trailing t.co (our ingested posts always have media).
 */

type CaptionSource = {
  text?: string;
  full_text?: string;
  display_text_range?: [number, number];
  entities?: {
    media?: { url?: string; indices?: [number, number] }[];
  };
};

function unicodeSlice(text: string, start: number, end: number) {
  return Array.from(text).slice(start, end).join("");
}

/** Caption-ready text from a syndication payload (excludes trailing media URLs). */
export function captionFromSyndication(data: CaptionSource): string {
  const raw = data.full_text ?? data.text ?? "";
  if (!raw) return "";

  if (data.display_text_range) {
    let [start, end] = data.display_text_range;
    const mediaStart = data.entities?.media?.[0]?.indices?.[0];
    if (typeof mediaStart === "number" && mediaStart < end) end = mediaStart;
    return unicodeSlice(raw, start, end).trimEnd();
  }

  return stripMediaShortlinks(raw, mediaShortlinksFrom(data));
}

function mediaShortlinksFrom(data: CaptionSource): string[] {
  return (data.entities?.media ?? [])
    .map((m) => m.url)
    .filter((u): u is string => Boolean(u));
}

function stripMediaShortlinks(text: string, mediaUrls: string[]): string {
  let out = text;
  for (const url of mediaUrls) {
    out = out.split(url).join("");
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/**
 * Display-time cleanup for stored captions that still include Twitter's
 * trailing media shortlink. Removes a single trailing t.co URL (the usual
 * media append); earlier t.co links in the caption are kept.
 */
export function cleanCaptionForDisplay(text: string): string {
  return text.replace(/\s*https?:\/\/t\.co\/[A-Za-z0-9]+$/u, "").trimEnd();
}
