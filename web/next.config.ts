import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js "N" / Turbopack corner badge in local screenshots
  devIndicators: false,
  // Vercel Next 16.2.x middleware packaging can omit @swc/helpers ESM and
  // surface MIDDLEWARE_INVOCATION_FAILED. Force-trace the helpers into the
  // function bundle (see vercel/next.js#93852).
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@swc/helpers/**/*"],
  },
};

// Do not wrap with withSentryConfig here: a top-level @sentry/nextjs import in
// next.config has been linked to middleware lambda crashes on Next 16.2 + Vercel.
// Runtime Sentry still loads via instrumentation.ts when NEXT_PUBLIC_SENTRY_DSN is set.
export default nextConfig;
