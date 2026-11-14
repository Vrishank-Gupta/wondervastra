import type { NextConfig } from "next";

const config: NextConfig = {
  // Lets the browser tests run their own server alongside a normal `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@libsql/client", "libsql", "sharp"],
  // Serverless hosts: ship the files these routes read from disk.
  outputFileTracingIncludes: {
    "/api/og/[id]": ["./public/seed/**/*"],
    ...(process.env.PREVIEW_MODE === "1" ? { "/**/*": ["./preview/catalogue.db"] } : {}),
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/seed/**" }],
    formats: ["image/webp"],
  },
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default config;
