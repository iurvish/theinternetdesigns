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
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.theinternetdesigns.com" },
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "**.r2.dev" },
      ...(cdnHost ? [{ protocol: "https" as const, hostname: cdnHost }] : []),
    ],
  },
};

export default nextConfig;
