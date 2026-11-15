import { cache } from "react";
import { memo } from "./memo";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { bestSalePrice, isLive, isOpenEnded, type OfferRule, type SaleRule } from "./pricing";

const { products, productImages, variants, categories, brands, reviews, sales, cartOffers } = schema;

export type ProductCard = {
  id: string; name: string; slug: string; shortDescription: string | null;
  categoryId: string; categoryName: string; categorySlug: string;
  brandId: string | null; brandName: string | null; brandSlug: string | null; isHouse: boolean;
  images: { url: string; alt: string | null }[];
  price: number; mrp: number; discountPct: number; saleName: string | null; saleBadge: string | null; saleEndsAt: number | null;
  inStock: boolean; totalStock: number; lowStock: boolean; showStockCount: boolean;
  comingSoon: boolean; launchNote: string | null;
  freeDelivery: boolean; deliveryCharge: number;
  rating: number; ratingCount: number;
  colors: { name: string; hex: string | null }[]; sizes: string[];
  tags: string[]; featured: boolean; createdAt: number; updatedAt: number;
  singleVariantId: string | null;
};

/** Sales that actually discount something buyable right now. Others aren't advertised (no "Winter Sale" with nothing in it). */
export function salesWithItems<T extends { name: string }>(sales: T[], cards: { saleName: string | null; inStock: boolean }[]) {
  return sales.filter((s) => cards.some((c) => c.inStock && c.saleName === s.name));
}
export const getLiveSales = cache(async (): Promise<SaleRule[]> => {
  const now = Date.now();
  const rows = await memo("sales", () => db.select().from(sales).where(eq(sales.active, true)));
  return rows.filter((s) => isLive(s, now)) as SaleRule[];
});
export const getLiveOffers = cache(async (): Promise<OfferRule[]> => {
  const now = Date.now();
  const rows = await memo("offers", () => db.select().from(cartOffers).where(eq(cartOffers.active, true)));
  return rows.filter((o) => isLive(o, now)) as OfferRule[];
});
export const getActiveCategories = cache(() => memo("categories", async () => {
  const cats = await db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.sortOrder), asc(categories.name));
  const counts = await db.select({ id: products.categoryId, n: sql<number>`count(*)`, onSale: sql<number>`sum(case when ${products.comingSoon} then 0 else 1 end)` })
    .from(products).where(eq(products.status, "active")).groupBy(products.categoryId);
  const map = new Map(counts.map((c) => [c.id, c]));
  // A category with no live listings never appears, so the store can't look half-empty.
  // One whose listings are all "Coming soon" still shows, marked as launching, and sorts after the ones you can buy today.
  return cats
    .map((c) => ({ ...c, productCount: Number(map.get(c.id)?.n ?? 0), buyableCount: Number(map.get(c.id)?.onSale ?? 0) }))
    .filter((c) => c.productCount > 0)
    .map((c) => ({ ...c, comingSoon: c.buyableCount === 0 }))
    .sort((a, b) => Number(a.comingSoon) - Number(b.comingSoon));
}));

/** Visible brands that have live listings, in the seller's display order. */
export const getActiveBrands = cache(() => memo("brands", async () => {
  const rows = await db.select().from(brands).where(eq(brands.active, true)).orderBy(asc(brands.sortOrder), asc(brands.name));
  const counts = await db.select({ id: products.brandId, n: sql<number>`count(*)` }).from(products).where(eq(products.status, "active")).groupBy(products.brandId);
  const map = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return rows.map((b) => ({ ...b, productCount: map.get(b.id) ?? 0 })).filter((b) => b.productCount > 0);
}));

export const getAllCards = cache((): Promise<ProductCard[]> => memo("cards", async () => {
  const rows = await db.select().from(products).where(eq(products.status, "active")).orderBy(desc(products.featured), desc(products.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [imgs, vars, cats, brandRows, liveSales, ratings] = await Promise.all([
    db.select().from(productImages).where(inArray(productImages.productId, ids)).orderBy(asc(productImages.sortOrder)),
    db.select().from(variants).where(and(inArray(variants.productId, ids), eq(variants.active, true))).orderBy(asc(variants.sortOrder)),
    db.select().from(categories),
    db.select().from(brands),
    getLiveSales(),
    db.select({ id: reviews.productId, avg: sql<number>`avg(${reviews.rating})`, n: sql<number>`count(*)` }).from(reviews).where(eq(reviews.status, "approved")).groupBy(reviews.productId),
  ]);
  const now = Date.now();
  return rows.flatMap((p) => {
    const cat = cats.find((c) => c.id === p.categoryId);
    if (!cat || !cat.active) return [];
    // A hidden brand hides its listings too, the same way a hidden category does.
    const brand = p.brandId ? brandRows.find((b) => b.id === p.brandId) ?? null : null;
    if (brand && !brand.active) return [];
    const vs = vars.filter((v) => v.productId === p.id);
    // The card shows the cheapest size, with that size's own MRP.
    const cheapest = vs.length ? vs.reduce((a, v) => ((v.price ?? p.price) < (a.price ?? p.price) ? v : a)) : null;
    const base = cheapest ? cheapest.price ?? p.price : p.price;
    const { price, sale } = bestSalePrice(base, p.id, p.categoryId, liveSales, now, p.brandId);
    const mrp = Math.max(cheapest?.mrp ?? p.compareAtPrice ?? 0, base);
    const totalStock = p.forceOutOfStock || p.comingSoon ? 0 : vs.reduce((a, v) => a + Math.max(0, v.stock), 0);
    const r = ratings.find((x) => x.id === p.id);
    const colors = new Map<string, string | null>();
    // Only real colours get dots on the card; text options such as Top / Bottom don't.
    vs.forEach((v) => { if (v.option2 !== "Default" && v.colorHex) colors.set(v.option2, v.colorHex); });
    return [{
      id: p.id, name: p.name, slug: p.slug, shortDescription: p.shortDescription,
      categoryId: p.categoryId, categoryName: cat.name, categorySlug: cat.slug,
      brandId: brand?.id ?? null, brandName: brand?.name ?? null, brandSlug: brand?.slug ?? null, isHouse: brand?.isHouse ?? false,
      images: imgs.filter((i) => i.productId === p.id).map((i) => ({ url: i.url, alt: i.alt })),
      price, mrp, discountPct: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0,
      saleName: sale?.name ?? null, saleBadge: sale?.badge ?? null, saleEndsAt: sale && !isOpenEnded(sale.endsAt) ? sale.endsAt : null,
      inStock: totalStock > 0, totalStock, lowStock: totalStock > 0 && totalStock <= p.lowStockThreshold, showStockCount: p.showStockCount,
      comingSoon: p.comingSoon, launchNote: p.launchNote,
      freeDelivery: p.deliveryMode === "free", deliveryCharge: p.deliveryMode === "free" ? 0 : p.deliveryCharge,
      rating: r ? Number(r.avg) : 0, ratingCount: r ? Number(r.n) : 0,
      colors: [...colors].map(([name, hex]) => ({ name, hex })),
      sizes: [...new Set(vs.map((v) => v.option1))],
      tags: p.tags, featured: p.featured, createdAt: p.createdAt, updatedAt: p.updatedAt,
      singleVariantId: vs.length === 1 ? vs[0].id : null,
    }];
  });
}));

export type Filters = {
  q?: string; category?: string; brand?: string; collection?: string; sort?: string; color?: string; size?: string;
  min?: number; max?: number; onSale?: boolean; inStock?: boolean; freeDelivery?: boolean;
};

export function applyFilters(cards: ProductCard[], f: Filters) {
  let out = cards;
  if (f.category) out = out.filter((c) => c.categorySlug === f.category);
  if (f.brand) {
    const wanted = f.brand.split(",");
    out = out.filter((c) => c.brandSlug != null && wanted.includes(c.brandSlug));
  }
  if (f.collection) out = out.filter((c) => c.tags.includes(f.collection!));
  if (f.q) {
    const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    out = out
      .map((c) => {
        const hay = [c.brandName, c.name, c.categoryName, c.shortDescription, ...c.tags, ...c.colors.map((x) => x.name)].join(" ").toLowerCase();
        const name = c.name.toLowerCase();
        const matches = terms.every((t) => hay.includes(t) || hay.includes(t.replace(/s$/, "")));
        return { c, matches, score: terms.filter((t) => name.includes(t)).length };
      })
      .filter((x) => x.matches)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }
  if (f.color) out = out.filter((c) => c.colors.some((x) => x.name === f.color));
  if (f.size) out = out.filter((c) => c.sizes.includes(f.size!));
  if (f.min != null) out = out.filter((c) => c.price >= f.min!);
  if (f.max != null) out = out.filter((c) => c.price <= f.max!);
  if (f.onSale) out = out.filter((c) => c.discountPct > 0);
  if (f.inStock) out = out.filter((c) => c.inStock);
  if (f.freeDelivery) out = out.filter((c) => c.freeDelivery);
  const sorted = [...out];
  switch (f.sort) {
    case "price_asc": sorted.sort((a, b) => a.price - b.price); break;
    case "price_desc": sorted.sort((a, b) => b.price - a.price); break;
    case "new": sorted.sort((a, b) => b.createdAt - a.createdAt); break;
    case "discount": sorted.sort((a, b) => b.discountPct - a.discountPct); break;
    case "rating": sorted.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount); break;
  }
  // Buyable items lead; then sold out; coming-soon items last. All stay visible so Notify me works.
  const rank = (c: ProductCard) => (c.inStock ? 0 : c.comingSoon ? 2 : 1);
  return sorted.sort((a, b) => rank(a) - rank(b));
}

export const getProductBySlug = cache(async (slug: string) => {
  const [p] = await db.select().from(products).where(eq(products.slug, slug));
  if (!p || p.status !== "active") return null;
  const [images, vars, cat, approved, brand] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, p.id)).orderBy(asc(productImages.sortOrder)),
    db.select().from(variants).where(and(eq(variants.productId, p.id), eq(variants.active, true))).orderBy(asc(variants.sortOrder)),
    db.select().from(categories).where(eq(categories.id, p.categoryId)),
    db.select().from(reviews).where(and(eq(reviews.productId, p.id), eq(reviews.status, "approved"))).orderBy(desc(reviews.createdAt)).limit(30),
    p.brandId ? db.select().from(brands).where(eq(brands.id, p.brandId)) : Promise.resolve([]),
  ]);
  if (brand[0] && !brand[0].active) return null;
  const liveSales = await getLiveSales();
  const now = Date.now();
  const pricedVariants = vars.map((v) => {
    const base = v.price ?? p.price;
    const { price, sale } = bestSalePrice(base, p.id, p.categoryId, liveSales, now, p.brandId);
    return {
      id: v.id, option1: v.option1, option2: v.option2, colorHex: v.colorHex, sku: v.sku,
      stock: p.forceOutOfStock || p.comingSoon ? 0 : Math.max(0, v.stock),
      price, mrp: Math.max(v.mrp ?? p.compareAtPrice ?? 0, base),
      saleName: sale?.name ?? null, saleEndsAt: sale && !isOpenEnded(sale.endsAt) ? sale.endsAt : null,
    };
  });
  return { product: p, images, variants: pricedVariants, category: cat[0] ?? null, brand: brand[0] ?? null, reviews: approved };
});
