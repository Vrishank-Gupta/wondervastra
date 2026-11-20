import type { NextConfig } from "next";

/** CF_BUILD=1 targets Cloudflare Workers (see wrangler.jsonc): no native modules, the web database client, Cloudinary images. */
const cf = process.env.CF_BUILD === "1";

/**
 * What the browser may load. Next.js needs inline scripts/styles; payments run in Razorpay's checkout;
 * photos come from Cloudinary. Everything else is this site only.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://*.razorpay.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://*.razorpay.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.razorpay.com https://cloudflareinsights.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

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
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/seed/**" }, { pathname: "/promo/**" }],
    formats: ["image/webp"],
  },
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  /**
   * Markdown copies of catalogue pages for AI assistants and agents (src/app/md): /p/<slug>.md, or the
   * page itself asked for with Accept: text/markdown. Guides and policies are converted in cf-worker.ts.
   */
  async rewrites() {
    const md = [{ type: "header" as const, key: "accept", value: ".*text/markdown.*" }];
    return {
      beforeFiles: [
        { source: "/index.md", destination: "/md/index" },
        { source: "/shop.md", destination: "/md/shop" },
        { source: "/:kind(p|c|brands)/:slug([^/]+)\\.md", destination: "/md/:kind/:slug" },
        { source: "/", has: md, destination: "/md/index" },
        { source: "/shop", has: md, destination: "/md/shop" },
        { source: "/:kind(p|c|brands)/:slug", has: md, destination: "/md/:kind/:slug" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self \"https://api.razorpay.com\")" },
          ...(process.env.NODE_ENV === "production"
            ? [
                // HTTPS only from now on (not includeSubDomains: email.wondervastra.in is GoDaddy's webmail shortcut).
                { key: "Strict-Transport-Security", value: "max-age=31536000" },
                { key: "Content-Security-Policy", value: CSP },
              ]
            : []),
        ],
      },
    ];
  },
};
export default config;
