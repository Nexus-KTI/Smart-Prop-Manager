import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Hide the Next.js "N" / Turbopack corner badge in local screenshots
  devIndicators: false,
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Sourcemaps upload only when SENTRY_AUTH_TOKEN is set in CI/deploy
  widenClientFileUpload: false,
});
