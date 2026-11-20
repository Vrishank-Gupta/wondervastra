/**
 * Buying guides: plain answers to what shoppers (and AI assistants answering them) ask about thermals.
 * Facts come from the live catalogue: each brand's own size chart, fabric, care and our prices, so the
 * guides never disagree with the product pages.
 */
import { getBuyables, type Buyable } from "./buyables";
import { getProductBySlug } from "./catalog";
import { money } from "./format";

export type SizeTable = { title: string; columns: string[]; rows: string[][] };
export type GuideProduct = Buyable & { material: string | null; care: string | null; chart: SizeTable[]; features: string[]; setFrom: number | null; pieceFrom: number | null };

export async function guideProducts(slug?: string): Promise<GuideProduct[]> {
  const items = await getBuyables(slug);
  const out: GuideProduct[] = [];
  for (const b of items) {
    const d = await getProductBySlug(b.slug);
    if (!d) continue;
    const p = d.product;
    let chart: SizeTable[] = [];
    try { chart = Array.isArray(p.sizeChart) ? p.sizeChart as SizeTable[] : JSON.parse(String(p.sizeChart ?? "[]")); } catch { chart = []; }
    const features = (p.description ?? "").split("\n").filter((l) => l.trim().startsWith("•")).map((l) => l.replace(/^\s*•\s*/, "").trim());
    const inStock = b.choices.filter((c) => c.stock > 0);
    const sets = inStock.filter((c) => c.isSet), pieces = inStock.filter((c) => !c.isSet);
    out.push({ ...b, material: p.material, care: p.care, chart, features,
      setFrom: sets.length ? Math.min(...sets.map((c) => c.price)) : null,
      pieceFrom: pieces.length ? Math.min(...pieces.map((c) => c.price)) : null });
  }
  return out;
}

/** "4–6 Y" → [4, 6]. */
export function ageRange(s: string): [number, number] | null {
  const m = s.match(/(\d+)\s*[–-]\s*(\d+)\s*Y/i);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
/** The chart row for a child of `age` full years: the range that starts at or below it and ends above it. */
export function rowForAge(rows: string[][], ageCol: number, age: number) {
  const ranges = rows.map((r) => ({ r, a: ageRange(r[ageCol] ?? "") })).filter((x) => x.a);
  return ranges.find((x) => x.a![0] <= age && age < x.a![1])?.r ?? ranges.find((x) => x.a![1] === age)?.r ?? null;
}

export const GUIDES = [
  { slug: "kids-thermal-size-chart", title: "Kids' thermal size chart by age", short: "Which size thermal to buy for a child of 2 to 11, brand by brand, from Amul's and Dollar's own charts." },
  { slug: "mens-thermal-size-guide", title: "Men's thermal size guide (S to XXL)", short: "Chest and waist measurements for Amul, Dollar and Lux men's thermals, and how to measure." },
  { slug: "amul-vs-dollar-vs-lux-thermals", title: "Amul vs Dollar vs Lux thermals: which to buy", short: "Fabric, features, sizes and prices of each brand's thermal warmer, side by side." },
  { slug: "thermal-wear-for-delhi-winter", title: "Thermal wear for Delhi winters: a simple guide", short: "When to start wearing thermals in Delhi NCR, how they should fit, and how to wash them so they last." },
] as const;
export type GuideSlug = (typeof GUIDES)[number]["slug"];

export const rupees = (p: number | null) => (p == null ? "–" : money(p).replace(/\.00$/, ""));
