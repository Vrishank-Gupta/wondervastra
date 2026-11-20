/**
 * Markdown copies of store pages for AI assistants and agents: the same facts as the HTML page without
 * the buttons, menus and scripts. Served at the page's address plus ".md" (/p/<slug>.md) and to any
 * request that asks for text/markdown. See cf-worker.ts and src/app/md/[...path]/route.ts.
 */
import { collectionFacts, metaDescription, priceLine, productFaq } from "./product-facts";
import { rupees, type GuideProduct } from "./guides";
import { areaPhrase } from "./seo";
import { business } from "./business";
import type { StoreSettings } from "./settings";
import { siteUrl } from "./utils";

const qa = (faq: { q: string; a: string }[]) => faq.flatMap((x) => [`### ${x.q}`, "", x.a, ""]);

/** The store in four lines: who sells, sourcing, delivery, contact. Ends every page so a quote carries context. */
export function storeFooter(s: StoreSettings) {
  const b = business(s);
  return [
    "---",
    "",
    `Sold by ${s.storeName}${b.tradingAs || b.name !== s.storeName ? ` (${b.name})` : ""}${b.address ? `, ${b.address}` : ""}: an independent online retailer of original branded thermal wear, bought directly from the brands and priced below MRP. Free delivery across ${areaPhrase(s)} in ${s.deliveryDaysMin}–${s.deliveryDaysMax} days; returns within ${s.returnWindowDays} days of delivery.`,
    `Contact: ${[b.phone, b.email].filter(Boolean).join(", ") || `${siteUrl()}/info/contact`}. Prices and stock are live; generated ${new Date().toISOString().slice(0, 10)}.`,
    "",
  ];
}

/** One row per piece and price, listing the in-stock sizes at that price ("sold out" when none are). */
function priceRows(p: GuideProduct) {
  const rows = new Map<string, { pick: string; price: number; mrp: number; sizes: string[]; out: string[] }>();
  for (const c of p.choices) {
    const k = `${c.pick}|${c.price}|${c.mrp}`;
    const r = rows.get(k) ?? { pick: c.pick, price: c.price, mrp: c.mrp, sizes: [], out: [] };
    (c.stock > 0 ? r.sizes : r.out).push(c.size.replace(/\s*\(.*\)$/, ""));
    rows.set(k, r);
  }
  return [...rows.values()].map((r) => `| ${r.pick} | ${r.sizes.join(", ") || "sold out"}${r.sizes.length && r.out.length ? ` (sold out: ${r.out.join(", ")})` : ""} | ${rupees(r.price)} | ${rupees(r.mrp)} |`);
}

export function productMarkdown(p: GuideProduct, s: StoreSettings, extra: { description: string | null; returnable: boolean; category: string | null }) {
  const base = siteUrl();
  const inStock = p.choices.some((c) => c.stock > 0);
  const t = p.chart[0];
  const sizesInStock = [...new Set(p.choices.filter((c) => c.stock > 0).map((c) => c.size))];
  return [
    `# ${p.fullName}`,
    "",
    `> ${metaDescription(p, s)}`,
    "",
    `- URL: ${base}/p/${p.slug}`,
    ...(p.brand ? [`- Brand: ${p.brand} (100% original, bought directly from ${p.brand})`] : []),
    ...(extra.category ? [`- Category: ${extra.category}`] : []),
    `- Price: ${priceLine(p) || "not on sale right now"} (inclusive of all taxes)`,
    `- Buy as: ${p.picks.join("; ")}${p.minPieces > 1 ? ` (sold in ${p.minPieces}s: mix any sizes and pieces)` : ""}`,
    `- Sizes: ${p.sizes.join(", ")}`,
    `- In stock: ${inStock ? sizesInStock.join(", ") : "sold out"}`,
    ...(p.material ? [`- Fabric: ${p.material}`] : []),
    ...(p.care ? [`- Care: ${p.care}`] : []),
    `- Delivery: free, ${areaPhrase(s)}, usually ${s.deliveryDaysMin}–${s.deliveryDaysMax} days`,
    `- Returns: ${extra.returnable ? `within ${s.returnWindowDays} days of delivery if unused` : "not returnable"}`,
    "",
    ...(extra.description ? ["## Description", "", extra.description.trim(), ""] : []),
    ...(t ? [
      `## Size chart (${t.title || `from ${p.brand ?? "the brand"}`})`, "",
      `| ${t.columns.join(" | ")} |`, `| ${t.columns.map(() => "---").join(" | ")} |`,
      ...t.rows.map((r) => `| ${r.join(" | ")} |`), "",
    ] : []),
    "## Prices by size", "",
    "| Piece | Sizes | Price | MRP |", "| --- | --- | --- | --- |",
    ...priceRows(p),
    "",
    "## Questions", "",
    ...qa(productFaq(p, s, { returnable: extra.returnable })),
    ...storeFooter(s),
  ].join("\n");
}

export function collectionMarkdown(title: string, path: string, items: GuideProduct[], s: StoreSettings, opts: { brand?: string; description?: string | null } = {}) {
  const base = siteUrl();
  const { intro, faq } = collectionFacts(title, items, s, opts);
  return [
    `# ${title}`,
    "",
    ...(opts.description || intro ? [`> ${opts.description || intro}`, ""] : []),
    `URL: ${base}${path}`,
    "",
    "## Products",
    "",
    ...items.flatMap((p) => [
      `### [${p.fullName}](${base}/p/${p.slug})`,
      "",
      `- Price: ${priceLine(p) || "sold out"}`,
      `- Sizes: ${p.sizes.join(", ")}`,
      ...(p.material ? [`- Fabric: ${p.material}`] : []),
      `- Details: ${base}/p/${p.slug}.md`,
      "",
    ]),
    ...(faq.length ? ["## Questions", "", ...qa(faq)] : []),
    ...storeFooter(s),
  ].join("\n");
}
