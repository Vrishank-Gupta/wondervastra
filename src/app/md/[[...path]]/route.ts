import { getActiveBrands, getActiveCategories, getProductBySlug } from "@/lib/catalog";
import { guideProducts } from "@/lib/guides";
import { collectionMarkdown, productMarkdown } from "@/lib/markdown";
import { previewMode } from "@/lib/preview";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/utils";
import { GET as llms } from "../../llms.txt/route";

export const dynamic = "force-dynamic";

/**
 * Markdown copies of the catalogue pages, for AI assistants and agents. Reached as /p/<slug>.md,
 * /c/<slug>.md, /brands/<slug>.md, /shop.md and /index.md (rewritten here), or with Accept: text/markdown.
 * Guides and policy pages are converted from their HTML in cf-worker.ts.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  if (previewMode()) return new Response("Preview site.", { status: 404 });
  const path = (await params).path ?? [];
  const [kind, slug] = path;
  if (!kind || kind === "index") return llms();
  const s = await getSettings();
  let md: string | null = null, page = "";

  if (kind === "p" && slug) {
    const d = await getProductBySlug(slug);
    const [p] = d ? await guideProducts(slug) : [];
    if (d && p) {
      page = `/p/${slug}`;
      md = productMarkdown(p, s, { description: d.product.description || d.product.shortDescription, returnable: d.product.returnable, category: d.category?.name ?? null });
    }
  } else if (kind === "c" && slug) {
    const cat = (await getActiveCategories()).find((c) => c.slug === slug);
    if (cat) {
      page = `/c/${slug}`;
      md = collectionMarkdown(cat.name, page, (await guideProducts()).filter((p) => p.categorySlug === slug), s, { description: cat.description });
    }
  } else if (kind === "brands" && slug) {
    const b = (await getActiveBrands()).find((x) => x.slug === slug);
    if (b) {
      page = `/brands/${slug}`;
      md = collectionMarkdown(`${b.name} thermals`, page, (await guideProducts()).filter((p) => p.brand === b.name), s, { brand: b.isHouse ? undefined : b.name });
    }
  } else if (kind === "shop" && !slug) {
    page = "/shop";
    md = collectionMarkdown("All thermals", page, await guideProducts(), s);
  }

  if (md == null) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      // The HTML page is the one to index; this is the same content in another format.
      Link: `<${siteUrl()}${page}>; rel="canonical"`,
      Vary: "Accept",
    },
  });
}
