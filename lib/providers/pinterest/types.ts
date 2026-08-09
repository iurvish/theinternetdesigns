export type PinMedia =
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

export type NormalizedPin = {
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
  media: PinMedia[];
  raw: unknown;
};
