export type CopyableMedia = {
  /** Database media id — analytics key and last-resort proxy. */
  mediaId?: string | null;
  kind: "image" | "video" | "gif";
  /** CDN URL currently on screen. */
  src?: string | null;
};

export function mediaProxyUrl(mediaId: string, variant?: "medium") {
  return variant
    ? `/api/media/${mediaId}?v=${variant}`
    : `/api/media/${mediaId}`;
}

/**
 * Same-origin URL for a CDN object via the `/media-cdn` rewrite.
 * Canvas can read this; it cannot read the cross-origin CDN element.
 */
export function sameOriginMediaUrl(src: string): string | null {
  try {
    const from = typeof window === "undefined" ? "http://local.invalid" : window.location.href;
    const url = new URL(src, from);
    if (url.protocol === "blob:" || url.protocol === "data:") return src;
    if (typeof window !== "undefined" && url.origin === window.location.origin) {
      return `${url.pathname}${url.search}`;
    }
    return `/media-cdn${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

const pngCache = new Map<string, Promise<Blob>>();
const proxyVideos = new Map<string, HTMLVideoElement>();
const proxyImages = new Map<string, HTMLImageElement>();

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

function fallbackProxyUrl(media: CopyableMedia, variant?: "medium") {
  if (media.src) {
    const rewritten = sameOriginMediaUrl(media.src);
    if (rewritten) return rewritten;
  }
  if (media.mediaId) return mediaProxyUrl(media.mediaId, variant);
  return null;
}

function fetchPng(media: CopyableMedia) {
  const key = media.mediaId ?? media.src;
  if (!key) return Promise.reject(new Error("no image"));
  return cached(`img:${key}`, async () => {
    const url = fallbackProxyUrl(media, "medium");
    if (!url) throw new Error("no image url");
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(String(res.status));
    return decodeToPng(await res.blob());
  });
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

/** Grab pixels from an already-decoded image or the current video frame. */
function snapshot(el: HTMLImageElement | HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  if (el instanceof HTMLVideoElement) {
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
  } else {
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
  }
  if (!canvas.width || !canvas.height) {
    return Promise.reject(new Error("frame not ready"));
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("no 2d context"));
  // Throws SecurityError (Safari) if the element was loaded cross-origin.
  ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
  return canvasToPng(canvas);
}

function waitForSeek(video: HTMLVideoElement, time: number): Promise<void> {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const target = Math.min(
    Math.max(0, time),
    Math.max(0, duration > 0 ? duration - 0.05 : 0),
  );

  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("seek failed"));
    };
    const timeout = window.setTimeout(fail, 12_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
    };

    if (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      Math.abs(video.currentTime - target) < 0.04
    ) {
      window.clearTimeout(timeout);
      resolve();
      return;
    }

    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.currentTime = Number.isFinite(target) ? target : 0;
    // Setting currentTime to the current value often skips `seeked`.
    if (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      Math.abs(video.currentTime - target) < 0.04
    ) {
      done();
    }
  });
}

function cacheImagePng(mediaId: string, el: HTMLImageElement) {
  void snapshot(el)
    .then((blob) => {
      pngCache.set(`el:${mediaId}`, Promise.resolve(blob));
    })
    .catch(() => {});
}

function warmProxyImage(media: CopyableMedia): HTMLImageElement | null {
  if (!media.mediaId) return null;
  const existing = proxyImages.get(media.mediaId);
  if (existing) return existing;
  const url = fallbackProxyUrl(media, "medium");
  if (!url) return null;

  const img = new Image();
  img.decoding = "async";
  img.src = url;
  proxyImages.set(media.mediaId, img);
  if (img.complete && img.naturalWidth) {
    cacheImagePng(media.mediaId, img);
  } else {
    img.addEventListener("load", () => cacheImagePng(media.mediaId!, img), {
      once: true,
    });
  }
  return img;
}

function waitForImage(img: HTMLImageElement): Promise<HTMLImageElement> {
  if (img.complete && img.naturalWidth) return Promise.resolve(img);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("image timeout")), 12_000);
    img.addEventListener(
      "load",
      () => {
        window.clearTimeout(timeout);
        resolve(img);
      },
      { once: true },
    );
    img.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        reject(new Error("image load failed"));
      },
      { once: true },
    );
  });
}

function warmProxyVideo(media: CopyableMedia): HTMLVideoElement | null {
  if (!media.mediaId) return null;
  const existing = proxyVideos.get(media.mediaId);
  if (existing) return existing;
  const url = fallbackProxyUrl(media) ?? mediaProxyUrl(media.mediaId);

  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("aria-hidden", "true");
  void video.load();
  video.addEventListener(
    "loadeddata",
    () => {
      void snapshot(video).catch(() => {});
    },
    { once: true },
  );
  proxyVideos.set(media.mediaId, video);
  return video;
}

function captureWarmedFrame(media: CopyableMedia, time: number): Promise<Blob> {
  const video = warmProxyVideo(media);
  if (!video) return Promise.reject(new Error("no video"));

  const start = () => waitForSeek(video, time).then(() => snapshot(video));

  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return start();

  return new Promise<Blob>((resolve, reject) => {
    const fail = () => reject(new Error("video load failed"));
    video.addEventListener("loadedmetadata", () => start().then(resolve, reject), {
      once: true,
    });
    video.addEventListener("error", fail, { once: true });
  });
}

/**
 * Warm the clipboard payload while the overlay is open so click is a write,
 * not a fetch. Prefer a live snapshot of the on-screen element; if the CDN
 * taints the canvas, decode a same-origin clone through `/media-cdn`.
 */
export function prefetchCopy(
  media: CopyableMedia,
  el?: HTMLImageElement | HTMLVideoElement | null,
) {
  if (el) {
    void snapshot(el)
      .then((blob) => {
        if (media.kind === "image" && media.mediaId) {
          pngCache.set(`el:${media.mediaId}`, Promise.resolve(blob));
        }
      })
      .catch(() => warmFallback(media));
    return;
  }
  warmFallback(media);
}

function warmFallback(media: CopyableMedia) {
  if (media.kind === "image") {
    warmProxyImage(media);
    return;
  }
  warmProxyVideo(media);
}

export function releaseCopyWarm(mediaId?: string | null) {
  if (!mediaId) return;
  const video = proxyVideos.get(mediaId);
  if (video) {
    video.removeAttribute("src");
    video.load();
    proxyVideos.delete(mediaId);
  }
  proxyImages.delete(mediaId);
}

function buildPng(
  media: CopyableMedia,
  el?: HTMLImageElement | HTMLVideoElement | null,
): Promise<Blob> {
  return (async () => {
    if (el) {
      try {
        return await snapshot(el);
      } catch {
        /* tainted or not ready — fall through */
      }
    }

    if (media.kind === "image") {
      if (media.mediaId) {
        const fromElement = pngCache.get(`el:${media.mediaId}`);
        if (fromElement) return fromElement;
        const warmed = proxyImages.get(media.mediaId);
        if (warmed) {
          try {
            return await snapshot(await waitForImage(warmed));
          } catch {
            /* still loading or tainted */
          }
        }
      }
      return fetchPng(media);
    }

    const time = el instanceof HTMLVideoElement ? el.currentTime : 0;
    return captureWarmedFrame(media, time);
  })();
}

/**
 * Copy exactly one media item as image pixels.
 *
 * Safari only grants clipboard access inside the gesture that triggered it, so
 * the PNG is handed to `ClipboardItem` as a promise rather than awaited first.
 */
export async function copySingleMedia(
  media: CopyableMedia,
  el?: HTMLImageElement | HTMLVideoElement | null,
): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    return false;
  }

  const { mediaId } = media;
  if (!mediaId) return false;

  const png = buildPng(media, el);

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    trackCopy(mediaId);
    return true;
  } catch {
    // Firefox rejects promise-valued clipboard items; retry with the blob.
    try {
      const blob = await png;
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      trackCopy(mediaId);
      return true;
    } catch {
      return false;
    }
  }
}

/** Best-effort analytics — never block the copy UX. */
function trackCopy(mediaId: string) {
  void fetch("/api/copy-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaId }),
    keepalive: true,
  }).catch(() => {});
}
