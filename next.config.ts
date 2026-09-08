import type { NextConfig } from "next";

// R2 CDN can be any custom domain the operator configures at deploy time.
// Rather than hardcode a hostname, we accept it from the environment so the
// operator only sets it in one place (.env).
const cdn = (() => {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return {
      host: url.hostname,
      base: `${url.origin}${url.pathname.replace(/\/$/, "")}`,
    };
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    if (!cdn) return [];
    // Same-origin reverse proxy so overlay copy can snapshot pixels without
    // waiting on the database-backed /api/media hop (CDN has no CORS).
    return [
      {
        source: "/media-cdn/:path*",
        destination: `${cdn.base}/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.theinternetdesigns.com" },
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "**.r2.dev" },
      ...(cdn ? [{ protocol: "https" as const, hostname: cdn.host }] : []),
    ],
  },
};

export default nextConfig;
