import "server-only";

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

type SyndVariant = { url: string; type: string; bitrate?: number };
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
};

function pickBestVideo(variants: SyndVariant[]): SyndVariant | null {
  const mp4 = variants.filter((v) => v.type === "video/mp4");
  if (mp4.length === 0) return null;
  return mp4.reduce((best, cur) =>
    (cur.bitrate ?? 0) > (best.bitrate ?? 0) ? cur : best,
  );
}

export async function fetchTweet(id: string): Promise<NormalizedTweet> {
  const url = new URL(SYNDICATION_URL);
  url.searchParams.set("id", id);
  url.searchParams.set("token", getToken(id));
  url.searchParams.set("lang", "en");

  const res = await fetch(url.toString(), {
    headers: { "user-agent": "Mozilla/5.0 (idesigns)" },
    cache: "no-store",
  });
  if (res.status === 404) throw new Error("Tweet not found");
  if (!res.ok) throw new Error(`Twitter syndication failed: ${res.status}`);
  const data = (await res.json()) as SyndResponse;

  const media: TweetMedia[] = (data.mediaDetails ?? []).map((m) => {
    const width = m.original_info?.width ?? null;
    const height = m.original_info?.height ?? null;
    if (m.type === "photo") {
      return { kind: "image", url: m.media_url_https, width, height };
    }
    const best = pickBestVideo(m.video_info?.variants ?? []);
    return {
      kind: m.type === "animated_gif" ? "gif" : "video",
      url: best?.url ?? m.media_url_https,
      posterUrl: m.media_url_https,
      width,
      height,
      durationMs: m.video_info?.duration_millis ?? null,
    };
  });

  return {
    id: data.id_str,
    url: `https://x.com/${data.user.screen_name}/status/${data.id_str}`,
    text: data.full_text ?? data.text ?? "",
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
