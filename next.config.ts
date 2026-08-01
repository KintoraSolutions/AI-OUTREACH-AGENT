import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
