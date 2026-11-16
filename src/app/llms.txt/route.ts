import { offerTiers } from "@/lib/pricing";
import { getActiveBrands, getActiveCategories, getAllCards, getLiveOffers } from "@/lib/catalog";
import { capabilities } from "@/lib/capabilities";
import { previewMode } from "@/lib/preview";
import { areaPhrase, brandPhrase } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/utils";
import { GUIDES, guideProducts, rupees } from "@/lib/guides";

export const dynamic = "force-dynamic";

/**
 * /llms.txt: a plain summary of the store for AI assistants (ChatGPT, Claude, Perplexity, Gemini),
 * following the llms.txt convention. Built live from the catalogue, so prices and stock are current.
 */
export async function GET() {
  if (previewMode()) return new Response("Preview site. Not for indexing.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const [s, cats, brands, cards, offers, products] = await Promise.all([getSettings(), getActiveCategories(), getActiveBrands(), getAllCards(), getLiveOffers(), guideProducts()]);
  const base = siteUrl();
  const caps = capabilities();
  const brandNames = brands.filter((b) => !b.isHouse).map((b) => b.name);
  const pay = [caps.onlinePayments && "UPI, cards, netbanking and wallets (Razorpay)", s.codEnabled && "cash on delivery"].filter(Boolean).join(" or ") || "online payment (opening soon)";
  const tiers = offerTiers(offers);
  const line = (p: (typeof products)[number]) => {
    const card = cards.find((c) => c.id === p.id);
    const inStock = p.choices.some((c) => c.stock > 0);
    const mrpSet = p.choices.filter((c) => c.isSet && c.stock > 0).sort((a, b) => a.price - b.price)[0];
    return [
      `### [${p.fullName}](${base}/p/${p.slug})`,
      p.description ? p.description.split(/\n/)[0] : "",
      `- Buy as: ${p.picks.join(", ")}${p.minPieces > 1 ? ` (sold in ${p.minPieces}s: mix any sizes and pieces)` : ""}`,
      `- Price: ${p.setFrom ? `set (top + bottom) from ${rupees(p.setFrom)}${mrpSet && mrpSet.mrp > mrpSet.price ? ` (MRP ${rupees(mrpSet.mrp)})` : ""}, ` : ""}single piece from ${rupees(p.pieceFrom)}${card?.discountPct ? `; up to ${card.discountPct}% below MRP` : ""}`,
      `- Sizes: ${p.sizes.join(", ")}`,
      ...(p.material ? [`- Fabric: ${p.material}`] : []),
      ...(p.features.length ? [`- Features: ${p.features.slice(0, 7).join("; ")}`] : []),
      ...(p.care ? [`- Care: ${p.care}`] : []),
      `- Availability: ${inStock ? "in stock" : "sold out"}`,
      "",
    ].filter((x, i) => x !== "" || i > 0).join("\n");
  };

  const out = [
    `# ${s.storeName}`,
    "",
    `> ${s.storeName} (${base}) is an online store in Delhi NCR, India, selling 100% original branded thermal wear (thermal warmers, also called inners or bodywarmers): kids' thermals for ages 2 to 11 and men's thermals in sizes S to XXL${brandNames.length ? `, from ${brandPhrase(brandNames)}` : ""}. Delivery is free on every order across ${areaPhrase(s)}.`,
    "",
    "## Key facts",
    `- Products: ${cats.filter((c) => !c.comingSoon).map((c) => c.name).join(", ") || "thermal wear"}; each sold as a top, a bottom, or a set (top + bottom)`,
    `- Brands: ${brandNames.join(", ") || "top brands"} (100% original stock)`,
    `- Delivery: free on every order, ${areaPhrase(s)} only, usually ${s.deliveryDaysMin}–${s.deliveryDaysMax} days; exact date shown for each pincode`,
    ...tiers.map((t) => `- Offer: ${t.label.toLowerCase()}${t.minPieces ? " pieces" : ""}, get ${t.reward.toLowerCase()} extra, on top of prices already below MRP (applied automatically in the cart)`),
    `- Returns: unused items within ${s.returnWindowDays} days of delivery; free pickup once approved; refund to the original payment method`,
    `- Payment: ${pay}`,
    "- No account needed to order; every order gets a tracking link",
    `- Family pack: pick a thermal and size for each family member on one page: ${base}/family-pack`,
    ...(s.supportEmail ? [`- Contact: ${s.supportEmail} or the form at ${base}/info/contact${s.supportHours ? ` (${s.supportHours})` : ""}`] : []),
    "",
    "## Buying guides",
    ...GUIDES.map((g) => `- [${g.title}](${base}/guides/${g.slug}): ${g.short}`),
    "",
    ...cats.filter((c) => !c.comingSoon).flatMap((c) => {
      const items = products.filter((p) => cards.find((x) => x.id === p.id)?.categoryId === c.id);
      return items.length ? [`## ${c.name} (${base}/c/${c.slug})`, "", ...items.map(line)] : [];
    }),
    "## Shop",
    `- [All products](${base}/shop)`,
    `- [Offers and sales](${base}/sale)`,
    ...brands.map((b) => `- [${b.name}](${base}/brands/${b.slug})`),
    "",
    "## Policies",
    `- [FAQs](${base}/info/faq)`,
    `- [Shipping policy](${base}/info/shipping-policy)`,
    `- [Returns and refunds](${base}/info/returns-policy)`,
    `- [Privacy policy](${base}/info/privacy-policy)`,
    `- [Terms of use](${base}/info/terms)`,
    `- [Contact](${base}/info/contact)`,
    `- [Track an order](${base}/track)`,
    "",
    `_Prices and stock are live and change often. Last generated ${new Date().toISOString().slice(0, 10)}._`,
    "",
  ].join("\n");
  return new Response(out, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
