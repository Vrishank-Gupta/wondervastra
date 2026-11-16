/**
 * Everything a shopper can buy, as the product page offers it: single pieces (Top, Bottom) and sets
 * (a top with the bottom in the same size). Prices include live sales. Used by the Google Shopping feed
 * and the family pack builder, so both match the product page exactly.
 */
import { getAllCards, getProductBySlug } from "./catalog";
import { sizeKey, withBrand } from "./utils";
import { isBottom, isTop, setName } from "./sets";


export type Choice = {
  /** "Top", "Bottom" or "Set (Top + Bottom)", as on the product page. */
  pick: string;
  isSet: boolean;
  size: string;
  /** Cart lines: one variant for a piece, top and bottom for a set. */
  variantIds: string[];
  pieces: number;
  price: number; mrp: number; stock: number;
  sku: string | null;
};
export type Buyable = {
  id: string; slug: string; name: string; fullName: string; brand: string | null;
  categoryName: string; categorySlug: string; kids: boolean;
  description: string; images: string[];
  minPieces: number;
  sizes: string[];
  picks: string[];
  choices: Choice[];
};

export async function getBuyables(): Promise<Buyable[]> {
  const cards = (await getAllCards()).filter((c) => !c.comingSoon);
  const out: Buyable[] = [];
  for (const c of cards) {
    const d = await getProductBySlug(c.slug);
    if (!d) continue;
    const { product: p, variants, images, brand } = d;
    const sizes = [...new Set(variants.map((v) => v.option1))];
    const kinds = [...new Set(variants.map((v) => v.option2))];
    const bottom = kinds.find((k) => isBottom(k));
    const tops = kinds.filter((k) => isTop(k));
    const choices: Choice[] = [];
    for (const v of variants) {
      choices.push({ pick: v.option2, isSet: false, size: v.option1, variantIds: [v.id], pieces: 1, price: v.price, mrp: v.mrp, stock: v.stock, sku: v.sku });
    }
    if (bottom) {
      for (const t of tops) {
        for (const s of sizes) {
          const a = variants.find((v) => v.option1 === s && v.option2 === t), b = variants.find((v) => v.option1 === s && v.option2 === bottom);
          if (!a || !b) continue;
          choices.push({ pick: setName(t, bottom), isSet: true, size: s, variantIds: [a.id, b.id], pieces: 2, price: a.price + b.price, mrp: a.mrp + b.mrp, stock: Math.min(a.stock, b.stock), sku: a.sku && b.sku ? `${a.sku}+${b.sku}` : null });
        }
      }
    }
    const sets = [...new Set(choices.filter((x) => x.isSet).map((x) => x.pick))];
    out.push({
      id: p.id, slug: p.slug, name: p.name, fullName: withBrand(p.name, brand?.name), brand: brand?.name ?? null,
      categoryName: c.categoryName, categorySlug: c.categorySlug,
      kids: /kid|child|boy|girl/i.test(c.categorySlug + " " + c.categoryName) || sizes.some((s) => /\d\s*Y\b/.test(s)),
      description: (p.shortDescription || p.description || "").replace(/\s+/g, " ").trim(),
      images: images.map((i) => i.url),
      minPieces: p.minPieces ?? 1,
      sizes, picks: [...sets, ...kinds], choices,
    });
  }
  return out;
}

export { sizeKey };
