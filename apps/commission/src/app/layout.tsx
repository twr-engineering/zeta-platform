import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// globals.css maps --font-sans / --font-heading / --font-mono into the Tailwind
// theme, so this must supply those exact variable names. Self-hosted through
// next/font (zero layout shift, no runtime request to Google).

// One family everywhere (product decision 2026-07-19): Inter carries every role
// — body, headings, hero money, and code/ID contexts — so all three tokens
// resolve to the same face. Hierarchy comes from size/weight, not family.
// Inter's tabular figures keep ₱ columns aligned digit-to-digit (see the
// `tabular-nums` in the affordance primitives).
const inter = Inter({
  variable: "--font-sans",
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
      <body className={`${inter.variable} antialiased`}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
