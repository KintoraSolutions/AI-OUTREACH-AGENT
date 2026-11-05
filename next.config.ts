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
  // Vercel rejects any request body over 4.5 MB at the edge, before the Server
  // Action runs, so advertising 5 MB here would fail the upload with an opaque
  // 413 rather than the app's own CSV error. Sized to what the host allows.
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  // The version banner is free reconnaissance.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The app is never meant to be embedded, and framing it is how a
          // clickjacked "Approve" button would be built.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
