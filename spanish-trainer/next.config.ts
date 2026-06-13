import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This app lives in a subdirectory of a larger repo; pin the tracing root to
  // this folder so Next.js doesn't pick up the parent project's lockfile.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
