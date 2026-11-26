import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { env } from "@/lib/config";
import "./globals.css";

const siteUrl = env.NEXT_PUBLIC_DOMAIN ? `https://${env.NEXT_PUBLIC_DOMAIN}` : undefined;

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: {
    default: "FeeFlow — Route creator fees to X accounts",
    template: "%s · FeeFlow",
  },
  description:
    "Creator fees of Pons v2 tokens on Robinhood Chain, routed to the X account behind every launch. Held onchain, claimable anytime, verifiable by anyone.",
  openGraph: {
    title: "FeeFlow — Route creator fees to X accounts",
    description:
      "Creator fees, routed to the X account behind every launch. Held onchain, claimable anytime, verifiable by anyone.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F6F2",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-ink">
        <a href="#main" className="sr-only-focusable rounded-lg bg-surface px-4 py-2 shadow">
          Skip to content
        </a>
        {/* Header and footer come from the route-group layouts: (site) is static, (app) adds auth. */}
        {children}
      </body>
    </html>
  );
}
