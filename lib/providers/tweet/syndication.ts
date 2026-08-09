import "server-only";

import { captionFromSyndication } from "./clean-caption";

const SYNDICATION_URL = "https://cdn.syndication.twimg.com/tweet-result";

function getToken(id: string) {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, "");
}

export type TweetMedia =
  | {
      kind: "image";
      url: string;
      width: number | null;
      height: number | null;
    }
  | {
      kind: "video" | "gif";
      url: string;
      posterUrl: string | null;
      width: number | null;
      height: number | null;
      durationMs: number | null;
    };

export type NormalizedTweet = {
  id: string;
  url: string;
  text: string;
  createdAt: string | null;
  creator: {
    sourceId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    profileUrl: string;
  };
  media: TweetMedia[];
  raw: unknown;
};

type SyndVariant = { url: string; content_type: string; bitrate?: number };
type SyndMedia = {
  type: "photo" | "video" | "animated_gif";
  media_url_https: string;
  original_info?: { width?: number; height?: number };
  video_info?: { duration_millis?: number; variants: SyndVariant[] };
};

type SyndUser = {
  id_str: string;
  name: string;
  screen_name: string;
  profile_image_url_https?: string;
};

type SyndResponse = {
  id_str: string;
  text?: string;
  full_text?: string;
  created_at?: string;
  user: SyndUser;
  mediaDetails?: SyndMedia[];
  display_text_range?: [number, number];
  entities?: {
    urls?: { url: string; display_url?: string; expanded_url?: string; indices?: [number, number] }[];
    media?: { url: string; display_url?: string; expanded_url?: string; indices?: [number, number] }[];
  };
};

function pickBestVideo(variants: SyndVariant[]): SyndVariant | null {
  const mp4 = variants.filter((v) => v.content_type === "video/mp4");
  if (mp4.length === 0) return null;
  return mp4.reduce((best, cur) =>
    (cur.bitrate ?? 0) > (best.bitrate ?? 0) ? cur : best,
  );
}

const FEATURES = [
  "tfw_timeline_list:",
  "tfw_follower_count_sunset:true",
  "tfw_tweet_edit_backend:on",
  "tfw_refsrc_session:on",
  "tfw_fosnr_soft_interventions_enabled:on",
  "tfw_show_birdwatch_pivots_enabled:on",
  "tfw_show_business_verified_badge:on",
  "tfw_duplicate_scribes_to_settings:on",
  "tfw_use_profile_image_shape_enabled:on",
  "tfw_show_blue_verified_badge:on",
  "tfw_legacy_timeline_sunset:true",
  "tfw_show_gov_verified_badge:on",
  "tfw_show_business_affiliate_badge:on",
  "tfw_tweet_edit_frontend:on",
].join(";");

export async function fetchTweet(id: string): Promise<NormalizedTweet> {
  const url = new URL(SYNDICATION_URL);
  url.searchParams.set("id", id);
  url.searchParams.set("lang", "en");
  url.searchParams.set("features", FEATURES);
  url.searchParams.set("token", getToken(id));

  const res = await fetch(url.toString(), {
    headers: { "user-agent": "Mozilla/5.0 (idesigns)" },
    cache: "no-store",
  });
  if (res.status === 404) throw new Error("Tweet not found");
  if (!res.ok) throw new Error(`Twitter syndication failed: ${res.status}`);
  const data = (await res.json()) as SyndResponse;

  const media: TweetMedia[] = (data.mediaDetails ?? []).map((m, i) => {
    const width = m.original_info?.width ?? null;
    const height = m.original_info?.height ?? null;
    if (m.type === "photo") {
      return { kind: "image", url: m.media_url_https, width, height };
    }
    const best = pickBestVideo(m.video_info?.variants ?? []);
    if (!best) {
      throw new Error(
        `Media #${i + 1} in this tweet is a ${m.type} but has no mp4 variant we can download (likely HLS-only or externally hosted).`,
      );
    }
    return {
      kind: m.type === "animated_gif" ? "gif" : "video",
      url: best.url,
      posterUrl: m.media_url_https,
      width,
      height,
      durationMs: m.video_info?.duration_millis ?? null,
    };
  });

  return {
    id: data.id_str,
    url: `https://x.com/${data.user.screen_name}/status/${data.id_str}`,
    // Caption-ready: exclude Twitter's trailing media t.co shortlink.
    text: captionFromSyndication(data),
    createdAt: data.created_at ?? null,
    creator: {
      sourceId: data.user.id_str,
      username: data.user.screen_name,
      displayName: data.user.name,
      avatarUrl: data.user.profile_image_url_https ?? null,
      profileUrl: `https://x.com/${data.user.screen_name}`,
    },
    media,
    raw: data,
  };
}
