import "server-only";

import type { NormalizedPin, PinMedia } from "./types";

export type { NormalizedPin, PinMedia } from "./types";

/**
 * Pinterest fetch via the public (unauthenticated) web PinResource endpoint,
 * with oEmbed as a thumbnail-only fallback.
 *
 * Limitations (shipped intentionally — still a usable admin path):
 * - PinResource is an unofficial web API; Pinterest may rate-limit or change it.
 * - Many pin videos are HLS-only (.m3u8). We ingest progressive .mp4 when
 *   present; otherwise we fall back to the pin's still image so publish works.
 * - Idea/story pins: we take the cover + any progressive video streams we find,
 *   not every page block.
 * - Optional `PINTEREST_COOKIE` helps if anonymous fetches start failing.
 */

type PinImage = { url?: string; width?: number; height?: number };
type PinVideoEntry = {
  url?: string;
  width?: number;
  height?: number;
  duration?: number;
};
type PinUser = {
  id?: string | number;
  username?: string;
  full_name?: string;
  image_medium_url?: string;
  image_small_url?: string;
};

type PinPayload = {
  id?: string | number;
  description?: string;
  closeup_user_note?: string;
  grid_title?: string;
  title?: string;
  created_at?: string;
  is_gif?: boolean;
  images?: Record<string, PinImage>;
  videos?: { video_list?: Record<string, PinVideoEntry>; duration?: number } | null;
  story_pin_data?: {
    pages?: Array<{
      video?: { video_list?: Record<string, PinVideoEntry> };
      blocks?: Array<{ video?: { video_list?: Record<string, PinVideoEntry> } }>;
    }>;
  } | null;
  carousel_data?: {
    carousel_slots?: Array<{ images?: Record<string, PinImage> }>;
  } | null;
  pinner?: PinUser | null;
  native_creator?: PinUser | null;
  closeup_attribution?: PinUser | null;
  board?: { owner?: PinUser | null } | null;
};

type OEmbedResponse = {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function pinHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "user-agent": UA,
    accept: "application/json,text/javascript,*/*;q=0.8",
    referer: "https://www.pinterest.com/",
    "x-pinterest-pws-handler": "www/index.js",
  };
  const cookie = process.env.PINTEREST_COOKIE?.trim();
  if (cookie) headers.cookie = cookie;
  return headers;
}

function area(w?: number | null, h?: number | null) {
  return (w ?? 0) * (h ?? 0);
}

function bestImage(images: Record<string, PinImage> | undefined): PinImage | null {
  if (!images) return null;
  const ranked = Object.entries(images)
    .filter(([, v]) => v?.url)
    .sort((a, b) => {
      // Prefer originals, then largest pixel area.
      if (a[0] === "orig") return -1;
      if (b[0] === "orig") return 1;
      return area(b[1].width, b[1].height) - area(a[1].width, a[1].height);
    });
  return ranked[0]?.[1] ?? null;
}

function collectVideoList(
  list: Record<string, PinVideoEntry> | undefined,
  out: PinVideoEntry[],
) {
  if (!list) return;
  for (const v of Object.values(list)) {
    if (v?.url) out.push(v);
  }
}

function pickProgressiveVideo(pin: PinPayload): PinVideoEntry | null {
  const candidates: PinVideoEntry[] = [];
  collectVideoList(pin.videos?.video_list, candidates);
  for (const page of pin.story_pin_data?.pages ?? []) {
    collectVideoList(page.video?.video_list, candidates);
    for (const block of page.blocks ?? []) {
      collectVideoList(block.video?.video_list, candidates);
    }
  }
  const mp4 = candidates
    .filter((v) => v.url && /\.mp4(\?|$)/i.test(v.url))
    .sort(
      (a, b) => area(b.width, b.height) - area(a.width, a.height),
    );
  return mp4[0] ?? null;
}

function pickCreator(pin: PinPayload): NormalizedPin["creator"] {
  const user =
    pin.pinner ??
    pin.native_creator ??
    pin.closeup_attribution ??
    pin.board?.owner ??
    null;
  const username = user?.username?.trim() || "pinterest";
  const sourceId = user?.id != null ? String(user.id) : username;
  return {
    sourceId,
    username,
    displayName: user?.full_name?.trim() || username,
    avatarUrl: user?.image_medium_url ?? user?.image_small_url ?? null,
    profileUrl: `https://www.pinterest.com/${username}/`,
  };
}

function mediaFromPin(pin: PinPayload): PinMedia[] {
  const media: PinMedia[] = [];
  const seen = new Set<string>();

  const pushImage = (images: Record<string, PinImage> | undefined) => {
    const img = bestImage(images);
    if (!img?.url || seen.has(img.url)) return;
    seen.add(img.url);
    // GIFs go through the image pipeline (sharp); processVideo expects mp4.
    media.push({
      kind: "image",
      url: img.url,
      width: img.width ?? null,
      height: img.height ?? null,
    });
  };

  const video = pickProgressiveVideo(pin);
  const cover = bestImage(pin.images);

  if (video?.url) {
    media.push({
      kind: "video",
      url: video.url,
      posterUrl: cover?.url ?? null,
      width: video.width ?? cover?.width ?? null,
      height: video.height ?? cover?.height ?? null,
      durationMs:
        video.duration != null
          ? Math.round(video.duration * (video.duration < 1000 ? 1000 : 1))
          : pin.videos?.duration != null
            ? Math.round(
                pin.videos.duration *
                  (pin.videos.duration < 1000 ? 1000 : 1),
              )
            : null,
    });
    if (cover?.url) seen.add(cover.url);
  } else {
    pushImage(pin.images);
  }

  for (const slot of pin.carousel_data?.carousel_slots ?? []) {
    pushImage(slot.images);
  }

  return media;
}

async function fetchPinResource(id: string): Promise<PinPayload> {
  const data = JSON.stringify({
    options: { id, field_set_key: "auth_web_main_pin" },
    context: {},
  });
  const url = new URL(
    "https://www.pinterest.com/resource/PinResource/get/",
  );
  url.searchParams.set("source_url", `/pin/${id}/`);
  url.searchParams.set("data", data);

  const res = await fetch(url.toString(), {
    headers: pinHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Pinterest PinResource failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    resource_response?: { status?: string; data?: PinPayload | null };
  };
  const payload = json.resource_response?.data;
  if (!payload || json.resource_response?.status !== "success") {
    throw new Error("Pin not found or unavailable.");
  }
  return payload;
}

async function fetchOEmbed(id: string): Promise<OEmbedResponse> {
  const url = new URL("https://www.pinterest.com/oembed.json");
  url.searchParams.set("url", `https://www.pinterest.com/pin/${id}/`);
  const res = await fetch(url.toString(), {
    headers: { "user-agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Pinterest oEmbed failed: ${res.status}`);
  return (await res.json()) as OEmbedResponse;
}

function normalizeFromResource(id: string, pin: PinPayload): NormalizedPin {
  const media = mediaFromPin(pin);
  const text =
    (pin.description || pin.closeup_user_note || pin.grid_title || pin.title || "")
      .trim();
  return {
    id: String(pin.id ?? id),
    url: `https://www.pinterest.com/pin/${id}/`,
    text,
    createdAt: pin.created_at ?? null,
    creator: pickCreator(pin),
    media,
    raw: pin,
  };
}

function normalizeFromOEmbed(id: string, oe: OEmbedResponse): NormalizedPin {
  if (!oe.thumbnail_url) {
    throw new Error("Pinterest oEmbed returned no media thumbnail.");
  }
  const username =
    oe.author_url?.replace(/\/$/, "").split("/").pop() ||
    oe.author_name?.replace(/\s+/g, "").toLowerCase() ||
    "pinterest";
  return {
    id,
    url: `https://www.pinterest.com/pin/${id}/`,
    text: (oe.title || "").trim(),
    createdAt: null,
    creator: {
      sourceId: username,
      username,
      displayName: oe.author_name?.trim() || username,
      avatarUrl: null,
      profileUrl: oe.author_url || `https://www.pinterest.com/${username}/`,
    },
    media: [
      {
        kind: "image",
        url: oe.thumbnail_url,
        width: oe.thumbnail_width ?? null,
        height: oe.thumbnail_height ?? null,
      },
    ],
    raw: oe,
  };
}

export async function fetchPin(id: string): Promise<NormalizedPin> {
  try {
    const pin = await fetchPinResource(id);
    const normalized = normalizeFromResource(id, pin);
    if (normalized.media.length === 0) {
      // Cover HLS-only / empty media via oEmbed still.
      return normalizeFromOEmbed(id, await fetchOEmbed(id));
    }
    return normalized;
  } catch (primary) {
    try {
      return normalizeFromOEmbed(id, await fetchOEmbed(id));
    } catch {
      throw primary instanceof Error
        ? primary
        : new Error("Failed to fetch Pinterest pin.");
    }
  }
}
