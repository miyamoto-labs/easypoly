import type { Metadata } from "next";
import dynamic from "next/dynamic";
import "./globals.css";

// Load Providers client-only — PrivyProvider cannot run during SSR/prerendering.
// This prevents hydration mismatches and Privy init errors during static generation.
const Providers = dynamic(() => import("./providers").then((m) => m.Providers), {
  ssr: false,
});

export const metadata: Metadata = {
  title: "EasyPoly — Play the Chart. Trade Polymarket.",
  description:
    "Click-to-bet arcade with a live Snake game on the BTC chart, plus AI-powered edge detection across 500+ Polymarket markets. Two ways to trade.",
  openGraph: {
    title: "EasyPoly — Play the Chart. Trade Polymarket.",
    description:
      "$1 click-to-bet arcade with a Snake game. AI scans 500+ markets for 15%+ edges. Two ways to trade Polymarket.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* JetBrains Mono for monospace numbers */}
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-ep-bg text-text-primary antialiased relative">
        <Providers>
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
