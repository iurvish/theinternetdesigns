export type CopyableMedia = {
  /** Database media id — copying goes through the same-origin proxy. */
  mediaId?: string | null;
  kind: "image" | "video" | "gif";
};

export function mediaProxyUrl(mediaId: string, variant?: "medium") {
  return variant
    ? `/api/media/${mediaId}?v=${variant}`
    : `/api/media/${mediaId}`;
}

const pngCache = new Map<string, Promise<Blob>>();

function cached(key: string, make: () => Promise<Blob>) {
  const hit = pngCache.get(key);
  if (hit) return hit;
  const pending = make().catch((err) => {
    pngCache.delete(key);
    throw err;
  });
  pngCache.set(key, pending);
  return pending;
}

function fetchPng(mediaId: string) {
  return cached(`img:${mediaId}`, () =>
    fetch(mediaProxyUrl(mediaId, "medium"), { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then(decodeToPng),
  );
}

/** Warm the clipboard payload on hover so the click is a write, not a fetch. */
export function prefetchCopy(media: CopyableMedia) {
  if (!media.mediaId || media.kind !== "image") return;
  void fetchPng(media.mediaId);
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      "image/png",
    );
  });
}

async function decodeToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvasToPng(canvas);
}

function frameToPng(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  if (!canvas.width || !canvas.height) {
    return Promise.reject(new Error("frame not ready"));
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("no 2d context"));
  // Throws SecurityError if the element was loaded cross-origin (tainted).
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasToPng(canvas);
}

/**
 * Re-decode the same instant through the same-origin proxy.
 *
 * The on-screen `<video>` streams from the CDN, which taints the canvas, so
 * the visible frame can't be read back directly. Seeking a detached element
 * to the same timestamp gives an untainted copy of exactly what's on screen.
 */
function proxiedFrameToPng(mediaId: string, time: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement("video");
    video.src = mediaProxyUrl(mediaId);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };
    const fail = (err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error("frame decode failed"));
    };

    video.onerror = () => fail(new Error("video load failed"));
    video.onloadedmetadata = () => {
      const target = Math.min(
        Math.max(0, time),
        Math.max(0, (video.duration || 0) - 0.05),
      );
      video.currentTime = Number.isFinite(target) ? target : 0;
    };
    video.onseeked = () => {
      frameToPng(video).then((blob) => {
        cleanup();
        resolve(blob);
      }, fail);
    };
  });
}

/**
 * Copy exactly one media item as image pixels.
 *
 * Safari only grants clipboard access inside the gesture that triggered it, so
 * the PNG is handed to `ClipboardItem` as a promise rather than awaited first.
 */
export async function copySingleMedia(
  media: CopyableMedia,
  video?: HTMLVideoElement | null,
): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    return false;
  }

  const { mediaId } = media;
  if (!mediaId) return false;

  const png =
    media.kind === "image"
      ? fetchPng(mediaId)
      : Promise.resolve()
          .then(() => {
            if (!video) throw new Error("no video");
            return frameToPng(video);
          })
          .catch(() => proxiedFrameToPng(mediaId, video?.currentTime ?? 0));

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return true;
  } catch {
    // Firefox rejects promise-valued clipboard items; retry with the blob.
    try {
      const blob = await png;
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      return true;
    } catch {
      return false;
    }
  }
}
