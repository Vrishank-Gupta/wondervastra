import { getProductBySlug } from "@/lib/catalog";
import { GUIDES, guideProducts } from "@/lib/guides";
import { productMarkdown } from "@/lib/markdown";
import { previewMode } from "@/lib/preview";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/utils";
import { GET as llms } from "../llms.txt/route";

export const dynamic = "force-dynamic";

/**
 * /llms-full.txt: /llms.txt followed by the full Markdown of every live product (size charts, prices by
 * size, questions and answers), so an assistant can answer from one file. Guides are linked as Markdown.
 */
export async function GET() {
  if (previewMode()) return new Response("Preview site. Not for indexing.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const base = siteUrl();
  const [summary, s, products] = await Promise.all([llms().then((r) => r.text()), getSettings(), guideProducts()]);
  const pages: string[] = [];
  for (const p of products) {
    const d = await getProductBySlug(p.slug);
    if (!d) continue;
    // One level down: each product's "# Title" becomes "## Title" inside this file.
    pages.push(productMarkdown(p, s, { description: d.product.description || d.product.shortDescription, returnable: d.product.returnable, category: d.category?.name ?? null })
      .replace(/^---\n[\s\S]*$/m, "").replace(/^(#+) /gm, "#$1 ").trim());
  }
  const out = [
    summary.trim(),
    "",
    "# Products in full",
    "",
    pages.join("\n\n"),
    "",
    "# Guides (Markdown)",
    "",
    ...GUIDES.map((g) => `- [${g.title}](${base}/guides/${g.slug}.md): ${g.short}`),
    "",
  ].join("\n");
  return new Response(out, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
