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

/** Social preview — lives in /public/og-image.jpg */
export const OG_IMAGE = {
  url: "/og-image.jpg",
  width: 2400,
  height: 1260,
  alt: SITE_NAME,
} as const;

export function buildSiteMetadata(siteUrl: string): Metadata {
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
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: HOME_TITLE,
      description: SITE_DESCRIPTION,
      images: [OG_IMAGE.url],
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

/** Extra homepage metadata layered on the root layout defaults. */
export const homePageMetadata: Metadata = {
  title: HOME_TITLE,
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  openGraph: {
    title: HOME_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    title: HOME_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};
