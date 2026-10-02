import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/admin/voice-preview": ["./.vercel-build-assets/**/*"],
    "/api/admin/demo/gold-khanjar/character-watch": ["./assets/gold-khanjar-preview/**/*"],
    "/api/admin/demo/gold-khanjar/shot-previews": ["./assets/gold-khanjar-preview/**/*"],
    "/api/queues/final-render": [
      "./.vercel-build-assets/**/*",
      "./assets/opening/opening-master.mp4",
      "./assets/opening/opening-master.json",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
