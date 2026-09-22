import type { Metadata } from "next";
import { Caveat, Geist, JetBrains_Mono } from "next/font/google";
import Script from "next/script";

import { BRAND_ASSETS, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

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
  icons: {
    icon: [{ url: BRAND_ASSETS.appIcon, type: "image/svg+xml" }],
    apple: [{ url: BRAND_ASSETS.appIcon }],
  },
};

const themeInitScript = `(function(){try{var s=localStorage.getItem("spm-theme");document.documentElement.setAttribute("data-theme",s==="dark"||s==="light"?s:"light");var c=localStorage.getItem("spm-sidebar-collapsed");var m=window.matchMedia("(max-width: 640px)").matches;document.documentElement.setAttribute("data-sidebar-collapsed",m||c==="1"?"true":"false");}catch(e){document.documentElement.setAttribute("data-theme","light");document.documentElement.setAttribute("data-sidebar-collapsed","false");}})();`;

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
      <body className="min-h-full">{children}</body>
    </html>
  );
}
