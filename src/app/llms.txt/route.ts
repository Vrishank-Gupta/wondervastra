import { offerTiers } from "@/lib/pricing";
import { getActiveBrands, getActiveCategories, getAllCards, getLiveOffers } from "@/lib/catalog";
import { capabilities } from "@/lib/capabilities";
import { money } from "@/lib/format";
import { previewMode } from "@/lib/preview";
import { areaPhrase, brandPhrase } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * /llms.txt: a plain summary of the store for AI assistants (ChatGPT, Claude, Perplexity, Gemini),
 * following the llms.txt convention. Built live from the catalogue, so prices and stock are current.
 */
export async function GET() {
  if (previewMode()) return new Response("Preview site. Not for indexing.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const [s, cats, brands, cards, offers] = await Promise.all([getSettings(), getActiveCategories(), getActiveBrands(), getAllCards(), getLiveOffers()]);
  const base = siteUrl();
  const caps = capabilities();
  const live = cards.filter((c) => !c.comingSoon);
  const brandNames = brands.filter((b) => !b.isHouse).map((b) => b.name);
  const pay = [caps.onlinePayments && "UPI, cards, netbanking and wallets (Razorpay)", s.codEnabled && "cash on delivery"].filter(Boolean).join(" or ") || "online payment (opening soon)";
  const line = (c: (typeof cards)[number]) =>
    `- [${c.brandName ? `${c.brandName} ` : ""}${c.name}](${base}/p/${c.slug}): ${money(c.price)}${c.mrp > c.price ? ` (MRP ${money(c.mrp)}, ${c.discountPct}% off)` : ""}${c.sizes.length && c.sizes[0] !== "Free size" ? `; sizes ${c.sizes.join(", ")}` : ""}${c.colors.length ? `; colours ${c.colors.map((x) => x.name).join(", ")}` : ""}; ${c.inStock ? "in stock" : "sold out"}`;

  const out = [
    `# ${s.storeName}`,
    "",
    `> ${s.storeName} (${base}) is an online store selling 100% original branded thermal wear at the lowest prices: kids' thermals for babies (0–24 months), boys and girls, and men's thermals${brandNames.length ? `, from ${brandPhrase(brandNames)}` : ""}. It delivers across ${areaPhrase(s)}${s.deliveryPincodes.trim() ? " for now; buyers can check their pincode on any product page" : ""}.`,
    "",
    "## Key facts",
    `- Products: ${cats.filter((c) => !c.comingSoon).map((c) => c.name).join(", ") || "thermal wear"}`,
    `- Brands: ${brandNames.join(", ") || "top brands"}`,
    "- Every product is 100% original branded stock, sold at the lowest prices the store can offer",
    `- Payment: ${pay}`,
    `- Delivery area: ${areaPhrase(s)}`,
    `- Dispatch within ${s.dispatchDays} working days; delivery usually ${s.deliveryDaysMin}–${s.deliveryDaysMax} days after dispatch`,
    ...offerTiers(offers).map((t) => `- Offer: ${t.label.toLowerCase()}${t.minPieces ? " pieces" : ""}, get ${t.reward.toLowerCase()} (applied automatically in the cart)`),
    "- Free delivery on every order",
    `- Returns: eligible unused items within ${s.returnWindowDays} days of delivery`,
    "- No account needed to order; every order gets a tracking link",
    ...(s.supportEmail ? [`- Contact: ${s.supportEmail}${s.whatsappNumber ? `, WhatsApp ${s.whatsappNumber}` : ""}${s.supportHours ? ` (${s.supportHours})` : ""}`] : []),
    "",
    "## Shop",
    `- [All products](${base}/shop)`,
    ...cats.filter((c) => !c.comingSoon).map((c) => `- [${c.name}](${base}/c/${c.slug})${c.tagline ? `: ${c.tagline}` : ""}`),
    ...([["baby", "Baby thermals (0–24 months)"], ["boys", "Boys' thermals"], ["girls", "Girls' thermals"]] as const).flatMap(([tag, label]) => {
      const c = cards.find((x) => x.tags.includes(tag));
      const cat = c && cats.find((k) => k.id === c.categoryId);
      return cat ? [`- [${label}](${base}/c/${cat.slug}?collection=${tag})`] : [];
    }),
    `- [Offers and sales](${base}/sale)`,
    ...brands.map((b) => `- [${b.name}](${base}/brands/${b.slug})`),
    "",
    ...cats.filter((c) => !c.comingSoon).flatMap((c) => {
      const items = live.filter((p) => p.categoryId === c.id);
      return items.length ? [`## ${c.name}`, ...items.map(line), ""] : [];
    }),
    "## Policies",
    `- [FAQs](${base}/info/faq)`,
    `- [Shipping policy](${base}/info/shipping-policy)`,
    `- [Returns and refunds](${base}/info/returns-policy)`,
    `- [Privacy policy](${base}/info/privacy-policy)`,
    `- [Terms of use](${base}/info/terms)`,
    `- [Contact](${base}/info/contact)`,
    `- [Track an order](${base}/track)`,
    "",
  ].join("\n");
  return new Response(out, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
