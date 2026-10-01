import type { MetadataRoute } from "next";

import { BRAND_ASSETS, BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

/** Manifest colors cannot read CSS tokens; values mirror --accent and --background (light). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_FULL,
    short_name: BRAND_NAME,
    description: BRAND_TAGLINE,
    start_url: "/login",
    display: "standalone",
    background_color: "#f7f8f7",
    theme_color: "#0f6e4f",
    icons: [
      { src: BRAND_ASSETS.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: BRAND_ASSETS.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: BRAND_ASSETS.iconMaskable512,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
