import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getLiveOffers, getLiveSales } from "./catalog";
import { maxPurchasable, priceCart, type CouponRule, type PriceLine, type Quote } from "./pricing";
import { getSettings } from "./settings";

const { products, variants, productImages, coupons, orders, orderItems } = schema;

export type CartInput = { variantId: string; qty: number };
export type Identity = { customerId?: string | null; email?: string | null; phone?: string | null };
export type QuoteLineView = {
  variantId: string; productId: string; slug: string; name: string; image: string | null;
  variantLabel: string; qty: number; maxQty: number; stock: number; unitPrice: number; unitMrp: number; lineTotal: number;
  saleName: string | null; deliveryMode: "free" | "flat"; deliveryCharge: number; codAllowed: boolean; returnable: boolean;
  issue: string | null; sku: string | null; hsnCode: string | null;
};
export type CartQuote = Quote & { views: QuoteLineView[]; codAvailable: boolean; codReason: string | null; blockingIssues: boolean; minimumIssue: string | null };

type SetListing = { minPieces: number; comboAbove: number | null };
/** "Sold in 2s": too few pieces of this listing, unless the whole cart (at normal prices) is above `comboAbove`. */
export function belowMinimum(p: SetListing, pieces: number, cartValue: number) {
  return pieces > 0 && pieces < p.minPieces && !(p.comboAbove != null && cartValue > p.comboAbove);
}

/** Cart lines, orders and invoices carry the brand, so "Lux Cozi Cotton Vest" is clear long after purchase. */
export function withBrand(name: string, brand?: string | null) {
  return brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name;
}

export function variantLabel(p: { option1Label: string; option2Label: string }, v: { option1: string; option2: string }) {
  const parts: string[] = [];
  if (v.option2 !== "Default") parts.push(v.option2);
  if (v.option1 !== "Free size") parts.push(`${p.option1Label} ${v.option1}`); else if (v.option2 === "Default") parts.push("Free size");
  return parts.join(" · ");
}

/** Lifetime pieces bought per product by this buyer, across their known identifiers. */
export async function piecesAlreadyBought(productIds: string[], who: Identity) {
  const conds = [
    who.customerId ? eq(orders.customerId, who.customerId) : undefined,
    who.email ? eq(orders.email, who.email) : undefined,
    who.phone ? eq(orders.phone, who.phone) : undefined,
  ].filter(Boolean);
  const out = new Map<string, number>();
  if (!conds.length || !productIds.length) return out;
  const rows = await db
    .select({ productId: orderItems.productId, n: sql<number>`sum(${orderItems.qty})` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(inArray(orderItems.productId, productIds), ne(orders.status, "cancelled"), ne(orders.status, "pending_payment"), or(...conds)))
    .groupBy(orderItems.productId);
  rows.forEach((r) => out.set(r.productId, Number(r.n)));
  return out;
}

export async function loadCoupon(code: string | null | undefined, who: Identity): Promise<{ coupon: CouponRule | null; error: string | null }> {
  const clean = code?.trim().toUpperCase();
  if (!clean) return { coupon: null, error: null };
  const [c] = await db.select().from(coupons).where(eq(coupons.code, clean));
  if (!c || !c.active) return { coupon: null, error: "That coupon code isn't valid." };
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return { coupon: null, error: "This coupon has been fully used." };
  const conds = [
    who.customerId ? eq(orders.customerId, who.customerId) : undefined,
    who.email ? eq(orders.email, who.email) : undefined,
    who.phone ? eq(orders.phone, who.phone) : undefined,
  ].filter(Boolean);
  if ((c.perCustomerLimit != null || c.firstOrderOnly) && !conds.length) {
    return { coupon: c as CouponRule, error: null }; // re-checked at checkout once we know the buyer
  }
  if (conds.length) {
    if (c.perCustomerLimit != null) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(orders)
        .where(and(eq(orders.couponCode, clean), ne(orders.status, "cancelled"), ne(orders.status, "pending_payment"), or(...conds)));
      if (Number(n) >= c.perCustomerLimit) return { coupon: null, error: "You've already used this coupon." };
    }
    if (c.firstOrderOnly) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(orders)
        .where(and(ne(orders.status, "cancelled"), ne(orders.status, "pending_payment"), or(...conds)));
      if (Number(n) > 0) return { coupon: null, error: "This coupon is for first orders only." };
    }
  }
  return { coupon: c as CouponRule, error: null };
}

/** The single source of truth for cart contents, limits and totals. Never trusts client prices. */
export async function quoteCart(
  items: CartInput[],
  opts: { couponCode?: string | null; paymentMethod?: "razorpay" | "cod"; who?: Identity } = {},
): Promise<CartQuote> {
  const who = opts.who ?? {};
  const merged = new Map<string, number>();
  for (const i of items) {
    if (i.qty > 0) merged.set(i.variantId, Math.min(999, (merged.get(i.variantId) ?? 0) + Math.floor(i.qty)));
  }
  const ids = [...merged.keys()];
  const vars = ids.length ? await db.select().from(variants).where(inArray(variants.id, ids)) : [];
  const prodIds = [...new Set(vars.map((v) => v.productId))];
  const [prods, imgs, s, liveSales, liveOffers, bought, couponRes, brandRows] = await Promise.all([
    prodIds.length ? db.select().from(products).where(inArray(products.id, prodIds)) : Promise.resolve([]),
    prodIds.length ? db.select().from(productImages).where(inArray(productImages.productId, prodIds)).orderBy(productImages.sortOrder) : Promise.resolve([]),
    getSettings(),
    getLiveSales(),
    getLiveOffers(),
    piecesAlreadyBought(prodIds, who),
    loadCoupon(opts.couponCode, who),
    db.select({ id: schema.brands.id, name: schema.brands.name }).from(schema.brands),
  ]);

  const priceLines: PriceLine[] = [];
  const meta = new Map<string, Omit<QuoteLineView, "unitPrice" | "unitMrp" | "lineTotal" | "saleName">>();
  const remainingForProduct = new Map<string, number>();

  for (const v of vars) {
    const p = prods.find((x) => x.id === v.productId);
    if (!p) continue;
    const wanted = merged.get(v.id) ?? 0;
    const stock = p.status === "active" && v.active && !p.forceOutOfStock && !p.comingSoon ? Math.max(0, v.stock) : 0;

    // Caps apply per listing, across its variants.
    const productCap = maxPurchasable({ stock: Number.MAX_SAFE_INTEGER, maxPerOrder: p.maxPerOrder, maxPerCustomer: p.maxPerCustomer, alreadyBought: bought.get(p.id) ?? 0 });
    const left = remainingForProduct.has(p.id) ? remainingForProduct.get(p.id)! : productCap;
    const maxQty = Math.min(stock, left);
    const qty = Math.min(wanted, maxQty);
    remainingForProduct.set(p.id, left - qty);

    let issue: string | null = null;
    if (p.status !== "active" || !v.active) issue = "No longer available";
    else if (p.comingSoon) issue = "Coming soon, not on sale yet";
    else if (stock === 0) issue = "Out of stock";
    else if (left === 0 && p.maxPerCustomer != null) issue = `Limit of ${p.maxPerCustomer} per customer reached`;
    else if (qty < wanted) {
      if (qty === stock) issue = `Only ${stock} left, quantity updated`;
      else if (p.maxPerOrder != null && qty === Math.min(p.maxPerOrder, left)) issue = `Limit of ${p.maxPerOrder} per order`;
      else issue = `Limit of ${p.maxPerCustomer} per customer`;
    }

    meta.set(v.id, {
      variantId: v.id, productId: p.id, slug: p.slug, name: withBrand(p.name, brandRows.find((b) => b.id === p.brandId)?.name),
      image: imgs.find((i) => i.productId === p.id)?.url ?? null,
      variantLabel: variantLabel(p, v), qty, maxQty, stock,
      deliveryMode: p.deliveryMode, deliveryCharge: p.deliveryCharge,
      codAllowed: p.codAllowed, returnable: p.returnable, issue, sku: v.sku, hsnCode: p.hsnCode,
    });
    if (qty > 0) {
      priceLines.push({
        key: v.id, productId: p.id, categoryId: p.categoryId, brandId: p.brandId, basePrice: v.price ?? p.price,
        compareAt: v.mrp ?? p.compareAtPrice, minPrice: v.minPrice, qty, deliveryMode: p.deliveryMode, deliveryCharge: p.deliveryCharge,
      });
    }
  }

  // "Sold in 2s": counted per listing across sizes, against the cart's value at normal prices.
  const cartValue = priceLines.reduce((a, l) => a + l.basePrice * l.qty, 0);
  let minimumIssue: string | null = null;
  for (const p of prods) {
    const own = priceLines.filter((l) => l.productId === p.id);
    const pieces = own.reduce((a, l) => a + l.qty, 0);
    if (belowMinimum(p, pieces, cartValue) && !minimumIssue) {
      const name = withBrand(p.name, brandRows.find((b) => b.id === p.brandId)?.name);
      minimumIssue = `${name} is sold in ${p.minPieces}s: add ${p.minPieces - pieces} more (any size, top or trouser)${p.comboAbove ? `, or shop for over ₹${Math.round(p.comboAbove / 100).toLocaleString("en-IN")} in all` : ""}.`;
      for (const l of own) { const m = meta.get(l.key); if (m && !m.issue) m.issue = `Add ${p.minPieces - pieces} more to buy this`; }
    }
  }

  const paymentMethod = opts.paymentMethod ?? "razorpay";
  const quote = priceCart({
    lines: priceLines, sales: liveSales, offers: liveOffers, coupon: couponRes.coupon, couponPrecheckError: couponRes.error,
    shippingCombine: s.shippingCombine, codFee: s.codFee, paymentMethod, now: Date.now(),
  });

  const views: QuoteLineView[] = [];
  for (const id of ids) {
    const m = meta.get(id);
    if (!m) continue;
    const priced = quote.lines.find((l) => l.key === id);
    views.push({
      ...m,
      unitPrice: priced?.unitPrice ?? 0,
      unitMrp: priced?.unitMrp ?? 0,
      lineTotal: priced?.lineTotal ?? 0,
      saleName: priced?.saleName ?? null,
    });
  }

  let codReason: string | null = null;
  if (!s.codEnabled) codReason = "Cash on delivery isn't available right now.";
  else if (views.some((v) => v.qty > 0 && !v.codAllowed)) codReason = "An item in your cart is prepaid only.";
  else if (s.codMaxOrder && quote.subtotal > s.codMaxOrder) codReason = "Cash on delivery isn't available for orders this large.";

  return { ...quote, views, codAvailable: !codReason, codReason, blockingIssues: views.some((v) => v.qty === 0) || Boolean(minimumIssue), minimumIssue };
}
