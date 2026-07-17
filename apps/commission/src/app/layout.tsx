import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, Geist_Mono } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// globals.css maps --font-sans / --font-heading / --font-mono into the Tailwind
// theme, so these must supply those exact variable names.

// Inter carries the product because this is a money app read on a phone: it
// holds up at 360px, and its `tnum` figures let ₱ columns align digit-to-digit
// (see the `tabular-nums` in the affordance primitives). `display: swap` keeps
// first paint honest on a slow mobile connection rather than blocking on fonts.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Inter Tight only for headings — same skeleton as Inter, tighter fit. It gives
// the hierarchy a voice without introducing a second typeface's quirks into
// figures the agent has to read carefully.
const interTight = Inter_Tight({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ZETA GCI + Collections",
    template: "%s · ZETA GCI + Collections",
  },
  description:
    "Commission and VAT engine, developer receivables, and GCI goal planning for Philippine real estate agents.",
};

export const viewport: Viewport = {
  // The daily loop runs on a phone (Master PRD §4.11); never let a wide table
  // force a zoomed-out viewport.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${interTight.variable} ${geistMono.variable} antialiased`}
      >
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
