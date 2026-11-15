/** Listings sold as a top and a bottom: the price of the set, so cards, titles and the product page all agree. */
const BOTTOM = /^(bottom|trousers?|lower)$/i;
const TOP = /top$/i;
type V = { option1: string; option2: string; price: number; mrp: number; stock: number };

/** The cheapest in-stock set (any top + the bottom, same size), or the cheapest set at all when none is in stock. */
export function cheapestSet(vs: V[]): { price: number; mrp: number; piece: number } | null {
  const sets: { price: number; mrp: number; stock: number }[] = [];
  for (const b of vs.filter((v) => BOTTOM.test(v.option2))) {
    for (const t of vs.filter((v) => TOP.test(v.option2) && v.option1 === b.option1)) {
      sets.push({ price: t.price + b.price, mrp: t.mrp + b.mrp, stock: Math.min(t.stock, b.stock) });
    }
  }
  if (!sets.length) return null;
  const pool = sets.some((s) => s.stock > 0) ? sets.filter((s) => s.stock > 0) : sets;
  const best = pool.reduce((a, s) => (s.price < a.price ? s : a));
  const pieces = vs.filter((v) => (TOP.test(v.option2) || BOTTOM.test(v.option2)) && (v.stock > 0 || !pool.some((s) => s.stock > 0)));
  return { price: best.price, mrp: best.mrp, piece: Math.min(...pieces.map((v) => v.price)) };
}
