import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";

import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-data",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
};

const themeInitScript = `(function(){try{var s=localStorage.getItem("spm-theme");document.documentElement.setAttribute("data-theme",s==="dark"||s==="light"?s:"light");var c=localStorage.getItem("spm-sidebar-collapsed");document.documentElement.setAttribute("data-sidebar-collapsed",c==="1"?"true":"false");}catch(e){document.documentElement.setAttribute("data-theme","light");document.documentElement.setAttribute("data-sidebar-collapsed","false");}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
