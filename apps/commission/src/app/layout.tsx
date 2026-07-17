import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// globals.css maps --font-sans / --font-mono into the Tailwind theme, so these
// must supply those exact variable names.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
