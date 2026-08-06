import "server-only";
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegStatic from "ffmpeg-static";
import { extractPalette, type PaletteColor } from "./colors";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const ffmpegPath = ffmpegStatic as unknown as string | null;

/** Decode a single frame with ffmpeg and return it as a JPEG buffer (stdout). */
function runFfmpeg(inputArgs: string[]): Promise<Buffer | null> {
  if (!ffmpegPath) return Promise.resolve(null);
  return new Promise((resolve) => {
    const proc = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        ...inputArgs,
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (b: Buffer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(b);
    };
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.on("error", () => finish(null));
    proc.on("close", (code) =>
      finish(code === 0 && chunks.length > 0 ? Buffer.concat(chunks) : null),
    );
    // ffmpeg reading a remote URL can hang on a bad connection — cap it.
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      finish(null);
    }, 20_000);
  });
}

/**
 * Grab the first frame of a video as a JPEG. Accepts a remote URL (downloaded
 * with browser-like headers first — more reliable than letting ffmpeg fetch it)
 * or an in-memory buffer. The bytes are written to a temp file so any mp4 layout
 * is seekable. Returns null if ffmpeg is unavailable or the decode fails — callers
 * fall back to the platform-supplied poster thumbnail.
 */
export async function firstFrameJpeg(input: string | Buffer): Promise<Buffer | null> {
  if (!ffmpegPath) return null;

  let bytes: Buffer;
  if (typeof input === "string") {
    try {
      const res = await fetch(input, {
        headers: {
          "user-agent": BROWSER_UA,
          referer: "https://x.com/",
          accept: "video/mp4,video/*,*/*;q=0.8",
        },
        cache: "no-store",
      });
      if (!res.ok) return null;
      bytes = Buffer.from(new Uint8Array(await res.arrayBuffer()));
    } catch {
      return null;
    }
  } else {
    bytes = input;
  }

  const path = join(tmpdir(), `frame-${randomUUID()}.mp4`);
  try {
    await writeFile(path, bytes);
    return await runFfmpeg(["-i", path]);
  } catch {
    return null;
  } finally {
    unlink(path).catch(() => {});
  }
}

/** First-frame colour palette for a video, or null if the frame can't be read. */
export async function firstFramePalette(
  input: string | Buffer,
): Promise<PaletteColor[] | null> {
  const jpeg = await firstFrameJpeg(input);
  if (!jpeg) return null;
  const palette = await extractPalette(jpeg);
  return palette.length > 0 ? palette : null;
}
