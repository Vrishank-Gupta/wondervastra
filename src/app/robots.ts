import type { MetadataRoute } from "next";
import { previewMode } from "@/lib/preview";
import { siteUrl } from "@/lib/utils";

export default function robots(): MetadataRoute.Robots {
  // A shared preview link should never end up in search results.
  if (previewMode()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/account", "/checkout", "/order", "/feedback"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
