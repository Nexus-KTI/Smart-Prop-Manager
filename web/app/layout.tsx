import type { Metadata } from "next";
import { Caveat, Geist, JetBrains_Mono } from "next/font/google";
import Script from "next/script";

import { ThemeRouteSync } from "@/components/ThemeRouteSync";
import { BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { APP_ROUTE_PREFIXES } from "@/lib/theme";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-data",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-signature",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
  applicationName: BRAND_NAME,
  // Child segments must not redefine openGraph: it would drop app/opengraph-image.png.
  openGraph: {
    title: `${BRAND_FULL} · Estate OS for Nigerian landlords`,
    description:
      "Unit truth for rent and chase, plus tenancies, messages, work orders, access, and staff - cash, transfer, card, WhatsApp.",
    type: "website",
    siteName: BRAND_FULL,
  },
  twitter: { card: "summary_large_image" },
};

const themeInitScript = `(function(){try{var p=location.pathname;var d=${JSON.stringify(APP_ROUTE_PREFIXES)}.some(function(x){return p===x||p.indexOf(x+"/")===0})?"dark":"light";var s=localStorage.getItem("spm-theme");document.documentElement.setAttribute("data-theme",s==="dark"||s==="light"?s:d);var c=localStorage.getItem("spm-sidebar-collapsed");var m=window.matchMedia("(max-width: 640px)").matches;document.documentElement.setAttribute("data-sidebar-collapsed",m||c==="1"?"true":"false");}catch(e){document.documentElement.setAttribute("data-theme","light");document.documentElement.setAttribute("data-sidebar-collapsed","false");}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${jetbrainsMono.variable} ${caveat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="spm-boot"
          strategy="beforeInteractive"
        >
          {themeInitScript}
        </Script>
      </head>
      <body className="min-h-full">
        <ThemeRouteSync />
        {children}
      </body>
    </html>
  );
}
