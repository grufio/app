/**
 * Next.js configuration.
 *
 * Responsibilities:
 * - Configure dev server origins for Playwright/E2E usage.
 */
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Playwright runs the dev server on 127.0.0.1 and may request internal `/_next/*`
  // resources from that origin. Next warns that this will be blocked by default in
  // a future major version unless explicitly allowed.
  allowedDevOrigins: ["127.0.0.1"],
}

export default nextConfig
