import type { NextConfig } from "next";
import { parsePublicEnv } from "@feeflow/config";

// Fail the build early on invalid public env, including the production mock-data guard.
parsePublicEnv({ ...process.env });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@feeflow/ui", "@feeflow/config"],
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
