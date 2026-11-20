/**
 * Plain-language facts about one product, written from its live data (prices, sizes, fabric, the brand's
 * own size chart, delivery and returns settings). Used for the product page's description tag, its
 * "Questions about this product" section, the Markdown copy and llms-full.txt, so search engines and AI
 * assistants quote the same numbers the shopper sees. Never invents a claim the data doesn't support.
 */
import { areaPhrase } from "./seo";
import { rupees, type GuideProduct } from "./guides";
import type { StoreSettings } from "./settings";

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function prices(p: GuideProduct) {
  const live = p.choices.filter((c) => c.stock > 0);
  const set = live.filter((c) => c.isSet).sort((a, b) => a.price - b.price)[0];
  const piece = live.filter((c) => !c.isSet).sort((a, b) => a.price - b.price)[0];
  return { set, piece };
}

/** "Set (top + bottom) ₹420 (MRP ₹506), single piece ₹210" */
export function priceLine(p: GuideProduct) {
  const { set, piece } = prices(p);
  const parts = [
    set && `set (top + bottom) from ${rupees(set.price)}${set.mrp > set.price ? ` (MRP ${rupees(set.mrp)})` : ""}`,
    piece && `single piece from ${rupees(piece.price)}${!set && piece.mrp > piece.price ? ` (MRP ${rupees(piece.mrp)})` : ""}`,
  ].filter(Boolean) as string[];
  return parts.join(", ");
}

/** "2–3 Y to 10–11 Y" or "S to XXL" */
export const sizeSpan = (p: GuideProduct) => (p.sizes.length > 1 ? `${p.sizes[0].replace(/\s*\(.*\)$/, "")} to ${p.sizes[p.sizes.length - 1].replace(/\s*\(.*\)$/, "")}` : p.sizes[0] ?? "");

/** About 150–200 characters for the description tag, from facts only. */
export function metaDescription(p: GuideProduct, s: StoreSettings) {
  const pl = priceLine(p);
  const inStock = p.choices.some((c) => c.stock > 0);
  return [
    `Buy ${p.fullName} online${pl ? `: ${pl}` : ""}.`,
    p.sizes.length ? `Sizes ${sizeSpan(p)}${p.kids ? " (by age)" : ""}.` : "",
    p.material ? `${p.material.replace(/\.$/, "")}.` : "",
    inStock ? `100% original, free delivery across ${s.deliveryAreaName || "India"} in ${s.deliveryDaysMin}–${s.deliveryDaysMax} days.` : "Sold out for now: tap Notify me.",
  ].filter(Boolean).join(" ");
}

/** The brand's chart as "45 cm: 2–3 Y, chest 45 cm" lines, for the sizes question. */
function chartLines(p: GuideProduct) {
  const t = p.chart[0];
  if (!t) return [];
  const cell = (c: string, v: string) => (/\(cm\)/i.test(c) ? `${c.replace(/\s*\(cm\)/i, "").toLowerCase()} ${v} cm` : `${c.toLowerCase()} ${v}`);
  return t.rows.map((r) => t.columns.map((c, i) => (i === 0 ? `size ${r[i]}` : cell(c, r[i] ?? ""))).join(", "));
}

export function productFaq(p: GuideProduct, s: StoreSettings, opts: { returnable: boolean }): { q: string; a: string }[] {
  const { set, piece } = prices(p);
  const brand = p.brand ?? s.storeName;
  const pieceKinds = p.picks.filter((k) => !/^set/i.test(k));
  const chart = chartLines(p);
  const out: { q: string; a: string }[] = [
    { q: `Is this ${p.fullName} original?`, a: `Yes. ${s.storeName} buys it directly from ${brand} and sends it new, in ${brand}'s own packaging with the MRP printed on it.` },
  ];
  if (set || piece) out.push({ q: "How much does it cost?", a: `${priceLine(p).replace(/^./, (c) => c.toUpperCase())}, including all taxes. Delivery is free.${p.minPieces > 1 ? ` It's sold in ${p.minPieces}s: mix any sizes, tops and bottoms.` : ""}` });
  if (p.sizes.length) {
    out.push({
      q: p.kids ? "Which size should I buy for my child?" : "What sizes does it come in?",
      a: `${p.kids ? "Sizes go by age" : "Sizes"}: ${list(p.sizes)}.${chart.length ? ` From ${brand}'s own chart: ${chart.join("; ")}.` : ""}${p.kids ? " If your child is between sizes, go one size up." : " Thermals should fit close to the body, so pick the size that matches your chest measurement."}`,
    });
  }
  if (set && pieceKinds.length) out.push({ q: "Can I buy just the top or just the bottom?", a: `Yes. You can buy ${list(pieceKinds.map((k) => k.replace(/\s*\(.*\)$/, "").toLowerCase()))} on its own, or both together as a set.` });
  if (p.material) out.push({ q: "What is it made of?", a: `${p.material.replace(/\.$/, "")}.${p.features.length ? ` ${brand} lists these features: ${p.features.slice(0, 6).join("; ").toLowerCase()}.` : ""}` });
  if (p.care) out.push({ q: "How do I wash it?", a: p.care });
  out.push({ q: "How fast is delivery?", a: `Delivery is free on every order across ${areaPhrase(s)}. Orders usually arrive in ${s.deliveryDaysMin}–${s.deliveryDaysMax} days; enter your pincode on this page to see your date.` });
  out.push(opts.returnable
    ? { q: "Can I return it?", a: `Yes, within ${s.returnWindowDays} days of delivery if it's unused and unwashed, with its tags and packaging. Pickup is free once the return is approved.` }
    : { q: "Can I return it?", a: "This item can't be returned. If it arrives damaged or wrong, contact us with photos and we'll sort it out." });
  return out;
}

/** A category or brand page: an intro paragraph and a few questions, from the listings on it. */
export function collectionFacts(name: string, items: GuideProduct[], s: StoreSettings, opts: { brand?: string } = {}) {
  const live = items.filter((p) => p.choices.some((c) => c.stock > 0));
  const brands = [...new Set(live.map((p) => p.brand).filter(Boolean))] as string[];
  const setFrom = Math.min(...live.map((p) => p.setFrom ?? Infinity));
  const pieceFrom = Math.min(...live.map((p) => p.pieceFrom ?? Infinity));
  const kids = live.filter((p) => p.kids), men = live.filter((p) => !p.kids);
  const span = (ps: GuideProduct[]) => {
    const all = ps.flatMap((p) => p.sizes.map((x) => x.replace(/\s*\(.*\)$/, "")));
    const uniq = [...new Set(all)];
    return uniq.length > 1 ? `${uniq[0]} to ${uniq[uniq.length - 1]}` : uniq[0] ?? "";
  };
  /** "ages 2 to 11", or "babies and children up to 14 years" when month sizes are in the mix. */
  const ages = (ps: GuideProduct[]) => {
    const sz = ps.flatMap((p) => p.sizes);
    const yrs = sz.map((x) => x.match(/(\d+)\s*[–-]\s*(\d+)\s*Y/)).filter(Boolean).map((m) => [Number(m![1]), Number(m![2])]);
    const months = sz.some((x) => /\d\s*M\b/.test(x));
    if (!yrs.length) return months ? "babies (0–24 months)" : "children";
    const lo = Math.min(...yrs.map((y) => y[0])), hi = Math.max(...yrs.map((y) => y[1]));
    return months ? `babies and children up to ${hi} years` : `ages ${lo} to ${hi}`;
  };
  const from = [Number.isFinite(setFrom) && `sets (top + bottom) from ${rupees(setFrom)}`, Number.isFinite(pieceFrom) && `single pieces from ${rupees(pieceFrom)}`].filter(Boolean).join(", ");
  const intro = live.length
    ? `${live.length} ${live.length === 1 ? "style" : "styles"} of ${name.toLowerCase().includes("thermal") ? name.toLowerCase() : `${name} thermals`}${!opts.brand && brands.length ? ` from ${list(brands)}` : ""}${kids.length ? `, for ${ages(kids)}` : ""}${men.length ? `${kids.length ? " and" : ","} men's sizes ${span(men)}` : ""}${from ? `: ${from}` : ""}. Every piece is 100% original, bought directly from the ${opts.brand ? "brand" : "brands"}, priced below MRP, and delivered free across ${areaPhrase(s)} in ${s.deliveryDaysMin}–${s.deliveryDaysMax} days.`
    : "";
  const faq: { q: string; a: string }[] = live.length ? [
    ...(!opts.brand && brands.length ? [{ q: `Which brands of ${name.toLowerCase()} do you sell?`, a: `${list(brands)}. All original stock bought directly from the brands, never copies.` }] : []),
    ...(opts.brand ? [{ q: `Are these genuine ${opts.brand} products?`, a: `Yes. We buy directly from ${opts.brand} and send every piece new, in ${opts.brand}'s own packaging with the MRP printed on it. ${s.storeName} is an independent retailer, not part of ${opts.brand}.` }] : []),
    ...(from ? [{ q: "How much do they cost?", a: `${from.replace(/^./, (c) => c.toUpperCase())}, including all taxes, always below MRP. Delivery is free.` }] : []),
    { q: "Which size should I buy?", a: `${kids.length ? `Kids' sizes go by age, for ${ages(kids)}. ` : ""}${men.length ? `Men's sizes run ${span(men)} by chest measurement. ` : ""}Every product page has the brand's own size chart, and our size guides compare brands side by side.` },
    { q: "Where do you deliver?", a: `Across ${areaPhrase(s)}, free on every order, usually in ${s.deliveryDaysMin}–${s.deliveryDaysMax} days. Unused items can be returned within ${s.returnWindowDays} days of delivery.` },
  ] : [];
  return { intro, faq };
}
