import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/sonner";
import { publicEnv } from "@/lib/env";
import { buildSiteMetadata } from "@/lib/site-config";
import "./globals.css";

// Inter is the whole site's typeface (variable font → every weight). Exposed as
// both --font-sans (the default) and --font-inter (the wordmark alias).
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = buildSiteMetadata(
  publicEnv.NEXT_PUBLIC_SITE_URL,
);

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
