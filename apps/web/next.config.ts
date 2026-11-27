import type { NextConfig } from "next";
import { parsePublicEnv } from "@feeflow/config";

// Fail the build early on invalid public env, including the production mock-data guard.
parsePublicEnv({ ...process.env });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@feeflow/ui", "@feeflow/config"],
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // Pons token logos (`logo()` → ipfs://) through the gateway in @feeflow/sdk's IPFS_GATEWAY.
    remotePatterns: [{ protocol: "https", hostname: "gateway.pinata.cloud", pathname: "/ipfs/**" }],
    // IPFS content never changes for a given CID, so cache optimised logos for 30 days.
    minimumCacheTTL: 2_592_000,
  },
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
