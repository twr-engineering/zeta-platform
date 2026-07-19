import type { Metadata, Viewport } from "next";
import { Libre_Franklin, Fraunces, Geist_Mono } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// globals.css maps --font-sans / --font-heading / --font-mono into the Tailwind
// theme, so these must supply those exact variable names. All three self-host
// through next/font (zero layout shift, no runtime request to Google).

// Body/UI: Libre Franklin, a Franklin-Gothic revival. It reads "established
// institution" — the register of a passbook or a land title, which is the tone
// a Philippine agent's money deserves — while staying a workhorse UI sans that
// holds up at 360px. Its tabular figures are what let ₱ columns align
// digit-to-digit (see the `tabular-nums` in the affordance primitives).
// `display: swap` keeps first paint honest on a slow mobile connection.
const libreFranklin = Libre_Franklin({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Display/money-hero: Fraunces, an optical-size serif. Headings and large money
// figures are set in it so the numbers carry the gravity of a prestige ledger
// rather than another admin-panel sans — the one deliberate risk of this system.
// Tabular figures keep hero money aligned; italic axis is loaded for emphasis.
const fraunces = Fraunces({
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
        className={`${libreFranklin.variable} ${fraunces.variable} ${geistMono.variable} antialiased`}
      >
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
