import type { NextConfig } from "next";

// R2 CDN can be any custom domain the operator configures at deploy time.
// Rather than hardcode a hostname, we accept it from the environment so the
// operator only sets it in one place (.env).
const cdnHost = (() => {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // X user avatars (used only during ingestion; we re-host to R2 afterwards,
      // but the fetch pipeline needs to know the hostnames it will read from).
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
      { protocol: "https", hostname: "video.twimg.com" },
      ...(cdnHost ? [{ protocol: "https" as const, hostname: cdnHost }] : []),
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb", // allow larger tweet payloads / manual uploads
    },
  },
};

export default nextConfig;
