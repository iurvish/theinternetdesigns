import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default:
      "The Internet Designs — UI Inspiration, Landing Pages & Design Gallery",
    template: "%s · The Internet Designs",
  },
  description:
    "Browse curated UI design inspiration: landing pages, interfaces, micro-interactions, product design, typography, 3D, brand design, logos, and illustration. Discover the best design work shared on X and Pinterest.",
  authors: [{ name: "The Internet Designs" }],
  creator: "The Internet Designs",
  metadataBase: new URL("https://www.theinternetdesigns.com"),
  icons: {
    icon: [
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.theinternetdesigns.com",
    title:
      "The Internet Designs — UI Inspiration, Landing Pages & Design Gallery",
    description:
      "Browse curated UI design inspiration: landing pages, interfaces, micro-interactions, product design, typography, 3D, brand design, logos, and illustration. Discover the best design work shared on X and Pinterest.",
    siteName: "The Internet Designs",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "The Internet Designs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title:
      "The Internet Designs — UI Inspiration, Landing Pages & Design Gallery",
    description:
      "Browse curated UI design inspiration: landing pages, interfaces, micro-interactions, product design, typography, 3D, brand design, logos, and illustration. Discover the best design work shared on X and Pinterest.",
    images: ["/og-image.jpg"],
    creator: "@0xUrvish",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      style={{ backgroundColor: "#f7f7f7", colorScheme: "light" }}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-[#f7f7f7] text-foreground"
        style={{ backgroundColor: "#f7f7f7" }}
        suppressHydrationWarning
      >
        {children}
        <Toaster position="top-center" richColors />
        <Analytics />
      </body>
    </html>
  );
}
