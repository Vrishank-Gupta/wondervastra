import type { NextConfig } from "next";

/** CF_BUILD=1 targets Cloudflare Workers (see wrangler.jsonc): no native modules, the web database client, Cloudinary images. */
const cf = process.env.CF_BUILD === "1";

const config: NextConfig = {
  // Lets the browser tests run their own server alongside a normal `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: cf ? [] : ["@libsql/client", "libsql", "sharp"],
  turbopack: cf ? { resolveAlias: { sharp: "./src/lib/cf/sharp-stub.ts", "@libsql/client": "@libsql/client/web" } } : undefined,
  // Serverless hosts: ship the files these routes read from disk.
  outputFileTracingIncludes: {
    "/api/og/[id]": ["./public/seed/**/*"],
    ...(process.env.PREVIEW_MODE === "1" ? { "/**/*": ["./preview/catalogue.db"] } : {}),
  },
  images: {
    ...(cf ? { loader: "custom" as const, loaderFile: "./src/lib/cf/image-loader.ts" } : {}),
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
