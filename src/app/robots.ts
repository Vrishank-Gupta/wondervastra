import type { MetadataRoute } from "next";
import { previewMode } from "@/lib/preview";
import { siteUrl } from "@/lib/utils";

/** Private areas stay out of search; everything a shopper can see is open to search engines and AI assistants. */
const PRIVATE = ["/admin", "/api/", "/account", "/checkout", "/order/", "/feedback/", "/cart"];
/** AI search and assistant crawlers, named explicitly so the store can be found and recommended in ChatGPT, Claude, Perplexity, Gemini and Copilot. */
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot", "Applebot-Extended", "Bingbot", "DuckAssistBot", "meta-externalagent", "CCBot"];

export default function robots(): MetadataRoute.Robots {
  // A shared preview link should never end up in search results.
  if (previewMode()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/api/og/"], disallow: PRIVATE },
      { userAgent: AI_BOTS, allow: ["/", "/llms.txt"], disallow: PRIVATE },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
