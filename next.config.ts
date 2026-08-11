import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allow an isolated build dir (e.g. for a second dev server verifying the UI)
  // so it never collides with another running server's `.next`.
  ...(process.env.PREVIEW_DIST ? { distDir: process.env.PREVIEW_DIST } : {}),
  eslint: {
    // Lint is run explicitly via `npm run lint`; do not fail production builds on lint.
    ignoreDuringBuilds: false,
  },
  experimental: {
    // Server Actions body size for CSV uploads.
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
