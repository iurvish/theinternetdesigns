import type { Metadata } from "next";

/** Public site name — matches the hero wordmark. */
export const SITE_NAME = "The Internet Designs";

export const SITE_TAGLINE =
  "Curated UI & design inspiration from X, Pinterest, and across the web";

/** Default meta description — landing pages, interfaces, interactions, etc. */
export const SITE_DESCRIPTION =
  "Browse curated UI design inspiration: landing pages, interfaces, micro-interactions, product design, typography, 3D, brand design, logos, and illustration. Discover the best design work shared on X and Pinterest.";

export const SITE_KEYWORDS = [
  "UI design inspiration",
  "web design gallery",
  "landing page design",
  "interface design",
  "UX inspiration",
  "design inspiration",
  "product design",
  "micro interactions",
  "typography design",
  "brand design",
  "logo design",
  "3D design",
  "illustration",
  "design portfolio",
  "X design inspiration",
  "Twitter design",
  "Pinterest UI",
  "SaaS landing page",
  "dashboard design",
  "mobile UI",
  "The Internet Designs",
];

/** Homepage-specific title — slightly longer for SEO. */
export const HOME_TITLE =
  "The Internet Designs — UI Inspiration, Landing Pages & Design Gallery";

/** Social preview — lives in /public/og-image.jpg (also served via app/opengraph-image.tsx). */
export const OG_IMAGE = {
  path: "/og-image.jpg",
  width: 2400,
  height: 1260,
  alt: SITE_NAME,
  type: "image/jpeg",
} as const;

/** Absolute HTTPS URL — X/Twitter require a fully-qualified image URL. */
export function absoluteOgImageUrl(siteUrl: string) {
  return new URL(OG_IMAGE.path, siteUrl).href;
}

export function buildDefaultSocialImage(siteUrl: string) {
  const url = absoluteOgImageUrl(siteUrl);
  return {
    url,
    secureUrl: url,
    width: OG_IMAGE.width,
    height: OG_IMAGE.height,
    alt: OG_IMAGE.alt,
    type: OG_IMAGE.type,
  };
}

/** X/Twitter card images must be JPEG, PNG, GIF, or WebP — not AVIF. */
export function isTwitterSafeImageUrl(url: string) {
  return /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(url);
}

export function pickPostSocialImage(
  media: {
    mediumUrl: string | null;
    thumbnailUrl: string | null;
    posterUrl: string | null;
    originalUrl: string;
    width: number | null;
    height: number | null;
  }[],
) {
  for (const item of media) {
    for (const candidate of [
      item.mediumUrl,
      item.thumbnailUrl,
      item.posterUrl,
      item.originalUrl,
    ]) {
      if (candidate && isTwitterSafeImageUrl(candidate)) {
        return {
          url: candidate,
          width: item.width ?? undefined,
          height: item.height ?? undefined,
        };
      }
    }
  }
  return null;
}

export function buildSiteMetadata(siteUrl: string): Metadata {
  const socialImage = buildDefaultSocialImage(siteUrl);

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: HOME_TITLE,
      template: `%s · ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    keywords: SITE_KEYWORDS,
    applicationName: SITE_NAME,
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    icons: {
      icon: [
        { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
        { url: "/favicon.svg", type: "image/svg+xml" },
      ],
      shortcut: "/favicon.ico",
      apple: [
        { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    manifest: "/site.webmanifest",
    openGraph: {
      type: "website",
      locale: "en_US",
      url: siteUrl,
      siteName: SITE_NAME,
      title: HOME_TITLE,
      description: SITE_DESCRIPTION,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: HOME_TITLE,
      description: SITE_DESCRIPTION,
      images: [{ url: socialImage.url, alt: socialImage.alt }],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
    alternates: {
      canonical: siteUrl,
    },
  };
}

type PostSocialMetadataInput = {
  siteUrl: string;
  path: string;
  title: string;
  description?: string | null;
  media: {
    mediumUrl: string | null;
    thumbnailUrl: string | null;
    posterUrl: string | null;
    originalUrl: string;
    width: number | null;
    height: number | null;
  }[];
};

export function buildPostSocialMetadata({
  siteUrl,
  path,
  title,
  description,
  media,
}: PostSocialMetadataInput): Metadata {
  const pageUrl = new URL(path, siteUrl).href;
  const postImage = pickPostSocialImage(media);
  const fallback = buildDefaultSocialImage(siteUrl);
  const socialImage = postImage
    ? {
        url: postImage.url,
        secureUrl: postImage.url,
        width: postImage.width,
        height: postImage.height,
        alt: title,
        type: "image/jpeg" as const,
      }
    : fallback;
  const metaDescription = description?.trim() || SITE_DESCRIPTION;

  return {
    title,
    description: metaDescription,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "article",
      url: pageUrl,
      siteName: SITE_NAME,
      title,
      description: metaDescription,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: metaDescription,
      images: [{ url: socialImage.url, alt: title }],
    },
  };
}

/** Extra homepage metadata layered on the root layout defaults. */
export const homePageMetadata: Metadata = {
  title: HOME_TITLE,
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
};
