/** Listings sold as a top and a bottom: the price of the set, so cards, titles and the product page all agree. */
/** "Top (Black)" → { base: "Top", colour: "Black" }. Pieces can carry the colour in stock in brackets. */
export function splitPiece(name: string): { base: string; colour: string | null } {
  const m = name.match(/^(.*?)[\s,]*\(([^()]+)\)\s*$/);
  return m ? { base: m[1].trim(), colour: m[2].trim() } : { base: name.trim(), colour: null };
}
/** A trouser: "Bottom", "Trouser", "Lower", with or without a colour. */
export const isBottom = (name: string) => /^(bottom|trousers?|lower)$/i.test(splitPiece(name).base);
/** A top: "Top", "Round neck top", "Top, Round neck", with or without a colour. */
export const isTop = (name: string) => /\btop\b/i.test(splitPiece(name).base);
/** "Set (Top + Bottom)", plus the colour when both pieces share one: "Set (Top + Bottom) (Black)". */
export function setName(top: string, bottom: string) {
  const t = splitPiece(top), b = splitPiece(bottom);
  const colour = t.colour && t.colour === b.colour ? t.colour : null;
  return `Set (${colour ? t.base : top} + ${colour ? b.base : bottom})${colour ? ` (${colour})` : ""}`;
}
const BOTTOM = { test: isBottom };
const TOP = { test: isTop };
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
