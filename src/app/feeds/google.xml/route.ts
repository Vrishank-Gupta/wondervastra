/**
 * Product feed for Google Merchant Center (free listings on Google Shopping, Search and Images).
 * Add this address once in Merchant Center as a scheduled fetch: https://wondervastra.in/feeds/google.xml
 * One entry per thing a shopper can buy in one tap: each piece and each set, per size. Kids' listings
 * are sold in twos, so only their sets go in the feed (a single piece can't be bought alone).
 */
import { getBuyables } from "@/lib/buyables";
import { getSettings } from "@/lib/settings";
import { sizeKey } from "@/lib/utils";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const inr = (paise: number) => `${(paise / 100).toFixed(2)} INR`;

export async function GET() {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://wondervastra.in").replace(/\/$/, "");
  const abs = (u: string) => (u.startsWith("http") ? u : `${site}${u.startsWith("/") ? "" : "/"}${u}`);
  const [items, s] = await Promise.all([getBuyables(), getSettings()]);
  const entries: string[] = [];
  for (const b of items) {
    if (!b.images.length) continue; // Google rejects products without a photo
    for (const c of b.choices) {
      if (b.minPieces > 1 && c.pieces < b.minPieces) continue;
      const what = c.isSet ? `Set (${c.pick.replace(/^Set \((.*)\)$/, "$1")})` : c.pick;
      const title = `${b.fullName} ${what}, ${sizeKey(c.size)}`.slice(0, 150);
      const link = `${site}/p/${b.slug}?${new URLSearchParams({ size: c.size, pick: c.pick })}`;
      const desc = `${b.description || b.fullName}${c.isSet ? " This set has one top and one bottom in the same size." : ""} Free delivery in Delhi NCR. Returnable within ${s.returnWindowDays} days of delivery.`;
      const sale = c.price < c.mrp;
      entries.push(`<item>
<g:id>${esc(c.variantIds.join("-"))}</g:id>
<g:item_group_id>${esc(b.id)}</g:item_group_id>
<g:title>${esc(title)}</g:title>
<g:description>${esc(desc.slice(0, 5000))}</g:description>
<g:link>${esc(link)}</g:link>
<g:image_link>${esc(abs(b.images[0]))}</g:image_link>
${b.images.slice(1, 11).map((u) => `<g:additional_image_link>${esc(abs(u))}</g:additional_image_link>`).join("\n")}
<g:availability>${c.stock > 0 ? "in_stock" : "out_of_stock"}</g:availability>
<g:price>${inr(sale ? c.mrp : c.price)}</g:price>
${sale ? `<g:sale_price>${inr(c.price)}</g:sale_price>` : ""}
<g:condition>new</g:condition>
${b.brand ? `<g:brand>${esc(b.brand)}</g:brand>` : ""}
<g:identifier_exists>no</g:identifier_exists>
${c.sku ? `<g:mpn>${esc(c.sku)}</g:mpn>` : ""}
<g:google_product_category>Apparel &amp; Accessories &gt; Clothing &gt; Underwear &amp; Socks &gt; Long Johns</g:google_product_category>
<g:product_type>${esc(b.categoryName)}</g:product_type>
<g:age_group>${b.kids ? "kids" : "adult"}</g:age_group>
<g:gender>${b.kids ? "unisex" : "male"}</g:gender>
<g:size>${esc(sizeKey(c.size))}</g:size>
<g:size_system>IN</g:size_system>
${c.isSet ? "<g:is_bundle>yes</g:is_bundle>" : ""}
<g:shipping><g:country>IN</g:country><g:service>Free delivery</g:service><g:price>0.00 INR</g:price></g:shipping>
</item>`.replace(/\n{2,}/g, "\n"));
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${esc(s.storeName || "WonderVastra")}</title>
<link>${site}</link>
<description>${esc(s.tagline || "Thermal wear")}</description>
${entries.join("\n")}
</channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
}
