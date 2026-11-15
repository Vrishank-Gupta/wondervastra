/**
 * Pure pricing engine, shared by the cart quote and order creation so the amount
 * a buyer sees is always the amount charged. Everything is in paise.
 */
export type SaleRule = {
  id: string;
  name: string;
  badge?: string | null;
  type: "percent" | "flat" | "min_price";
  value: number;
  scope: "all" | "category" | "brand" | "products";
  targetIds: string[];
  startsAt: number;
  endsAt: number;
  active: boolean;
};
export type OfferRule = {
  id: string;
  name: string;
  type: "free_shipping" | "percent" | "flat";
  value: number;
  minSubtotal: number;
  /** Pieces in the cart needed for this offer ("pick any 3"); 0 means it goes by cart value only. */
  minPieces?: number | null;
  maxDiscount?: number | null;
  combinesWithCoupons: boolean;
  startsAt?: number | null;
  endsAt?: number | null;
  active: boolean;
};
export type CouponRule = {
  code: string;
  type: "percent" | "flat" | "free_shipping";
  value: number;
  minSubtotal: number;
  maxDiscount?: number | null;
  startsAt?: number | null;
  endsAt?: number | null;
  excludeSaleItems: boolean;
  active: boolean;
};
export type PriceLine = {
  key: string;
  productId: string;
  categoryId: string;
  brandId?: string | null;
  basePrice: number;
  compareAt?: number | null;
  /** The size's minimum price, used only by a live "minimum price" sale. */
  minPrice?: number | null;
  qty: number;
  deliveryMode: "free" | "flat";
  deliveryCharge: number;
};
export type PricedLine = PriceLine & {
  unitPrice: number;
  unitMrp: number;
  lineTotal: number;
  saleName: string | null;
};
export type Quote = {
  lines: PricedLine[];
  subtotal: number;
  mrpTotal: number;
  savingsOnPrice: number;
  offer: { name: string; discount: number } | null;
  coupon: { code: string; discount: number; freeShipping: boolean } | null;
  couponError: string | null;
  shipping: number;
  shippingNote: string | null;
  codFee: number;
  total: number;
  totalSavings: number;
  nextOffer: { name: string; type: OfferRule["type"]; value: number; remaining: number; minSubtotal: number; piecesLeft: number; minPieces: number } | null;
  /** Every live cart reward in order, for the stepped "buy more, save more" bar. */
  tiers: Tier[];
  /** Pieces in the cart, which piece-count offers go by. */
  pieces: number;
};

/** Sales saved without an end date run until this time and show no countdown. */
export const NO_END = Date.UTC(2100, 0, 1);
export const isOpenEnded = (endsAt: number | null | undefined) => endsAt != null && endsAt >= NO_END;

/** "20% off", "₹50 off" or "Lowest prices" for a sale. */
export function saleLabel(s: Pick<SaleRule, "type" | "value">) {
  return s.type === "min_price" ? "Lowest prices" : s.type === "percent" ? `${s.value}% off` : `${rupees(s.value)} off`;
}
export function rewardLabel(o: Pick<OfferRule, "type" | "value" | "maxDiscount">) {
  if (o.type === "free_shipping") return "Free delivery";
  if (o.type === "percent") return `${o.value}% off${o.maxDiscount ? ` (up to ${rupees(o.maxDiscount)})` : ""}`;
  return `${rupees(o.value)} off`;
}
export type Tier = { minSubtotal: number; minPieces: number; label: string; reward: string; reached: boolean };
/** "Pick any 3" or "₹1,000+": what unlocks an offer, in the buyer's words. */
export function offerCondition(o: Pick<OfferRule, "minSubtotal" | "minPieces">) {
  if (o.minPieces) return `Pick any ${o.minPieces}`;
  return `Shop for ${rupees(o.minSubtotal)}`;
}
/** Cart rewards a buyer can work towards, smallest step first. Piece-count steps come before cart-value ones. */
export function offerTiers(offers: OfferRule[], pieces = 0, subtotal = 0): Tier[] {
  return [...offers].filter((o) => o.minSubtotal > 0 || (o.minPieces ?? 0) > 0)
    .sort((a, b) => (b.minPieces ? 1 : 0) - (a.minPieces ? 1 : 0) || (a.minPieces ?? 0) - (b.minPieces ?? 0) || a.minSubtotal - b.minSubtotal || (a.type === "free_shipping" ? -1 : 1))
    .map((o) => ({ minSubtotal: o.minSubtotal, minPieces: o.minPieces ?? 0, label: offerCondition(o), reward: rewardLabel(o), reached: subtotal >= o.minSubtotal && pieces >= (o.minPieces ?? 0) }));
}

export function isLive(r: { active: boolean; startsAt?: number | null; endsAt?: number | null }, now: number) {
  return r.active && (r.startsAt == null || r.startsAt <= now) && (r.endsAt == null || r.endsAt > now);
}
function saleApplies(s: SaleRule, productId: string, categoryId: string, brandId?: string | null) {
  if (s.scope === "all") return true;
  if (s.scope === "category") return s.targetIds.includes(categoryId);
  if (s.scope === "brand") return brandId != null && s.targetIds.includes(brandId);
  return s.targetIds.includes(productId);
}
/** Rupee rounding keeps sale prices clean and predictable. */
function applySale(price: number, s: SaleRule, minPrice?: number | null) {
  if (s.type === "min_price") return minPrice && minPrice < price ? minPrice : price;
  const off = s.type === "percent" ? Math.round((price * s.value) / 100) : s.value;
  const next = price - off;
  return Math.max(100, Math.round(next / 100) * 100);
}
/** The best live sale wins; sales never stack with each other. */
export function bestSalePrice(
  basePrice: number,
  productId: string,
  categoryId: string,
  sales: SaleRule[],
  now: number,
  brandId?: string | null,
  minPrice?: number | null,
): { price: number; sale: SaleRule | null } {
  let best = { price: basePrice, sale: null as SaleRule | null };
  for (const s of sales) {
    if (!isLive(s, now) || !saleApplies(s, productId, categoryId, brandId)) continue;
    const p = applySale(basePrice, s, minPrice);
    if (p < best.price) best = { price: p, sale: s };
  }
  return best;
}
/** Percent discounts are rounded to the whole rupee, like sale prices, so totals never show paise. */
function ruleDiscount(type: string, value: number, base: number, max?: number | null) {
  if (type === "free_shipping") return 0;
  let d = type === "percent" ? Math.round((base * value) / 10000) * 100 : value;
  if (max != null) d = Math.min(d, max);
  return Math.max(0, Math.min(d, base));
}

export function priceCart(input: {
  lines: PriceLine[];
  sales: SaleRule[];
  offers: OfferRule[];
  coupon?: CouponRule | null;
  couponPrecheckError?: string | null;
  shippingCombine: "highest" | "sum";
  codFee: number;
  paymentMethod: "razorpay" | "cod";
  now: number;
}): Quote {
  const { now } = input;
  const lines: PricedLine[] = input.lines.map((l) => {
    const { price, sale } = bestSalePrice(l.basePrice, l.productId, l.categoryId, input.sales, now, l.brandId, l.minPrice);
    const unitMrp = Math.max(l.compareAt ?? 0, l.basePrice);
    return { ...l, unitPrice: price, unitMrp, lineTotal: price * l.qty, saleName: sale?.name ?? null };
  });
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
  const mrpTotal = lines.reduce((a, l) => a + l.unitMrp * l.qty, 0);

  // Delivery: per listing, combined into one parcel charge.
  const charges = lines.filter((l) => l.deliveryMode === "flat").map((l) => l.deliveryCharge);
  const baseShipping =
    charges.length === 0 ? 0 : input.shippingCombine === "sum" ? charges.reduce((a, b) => a + b, 0) : Math.max(...charges);

  const liveOffers = input.offers.filter((o) => isLive(o, now));
  const pieces = lines.reduce((a, l) => a + l.qty, 0);
  const qualifying = liveOffers.filter((o) => subtotal >= o.minSubtotal && pieces >= (o.minPieces ?? 0));

  // Best cart-value discount.
  let offer: OfferRule | null = null;
  let offerDiscount = 0;
  for (const o of qualifying) {
    if (o.type === "free_shipping") continue;
    const d = ruleDiscount(o.type, o.value, subtotal, o.maxDiscount);
    if (d > offerDiscount) { offer = o; offerDiscount = d; }
  }

  // Coupon.
  let couponError = input.couponPrecheckError ?? null;
  let coupon: Quote["coupon"] = null;
  const c = input.coupon;
  if (c && !couponError) {
    const eligible = c.excludeSaleItems ? lines.filter((l) => !l.saleName).reduce((a, l) => a + l.lineTotal, 0) : subtotal;
    if (!isLive(c, now)) couponError = "This coupon has expired or is not active yet.";
    else if (subtotal < c.minSubtotal) couponError = `Add items worth ${rupees(c.minSubtotal - subtotal)} more to use ${c.code}.`;
    else if (c.excludeSaleItems && eligible === 0) couponError = `${c.code} doesn't apply to items already on sale.`;
    else {
      coupon = {
        code: c.code,
        discount: ruleDiscount(c.type, c.value, eligible, c.maxDiscount),
        freeShipping: c.type === "free_shipping",
      };
    }
  }

  // An offer that doesn't combine: the buyer keeps whichever saves more.
  if (coupon && offer && !offer.combinesWithCoupons) {
    if (coupon.discount > offerDiscount || coupon.freeShipping) {
      if (coupon.freeShipping && offerDiscount > baseShipping) {
        coupon = null;
        couponError = `Your "${offer.name}" offer already saves you more than this coupon.`;
      } else {
        offer = null;
        offerDiscount = 0;
      }
    } else {
      coupon = null;
      couponError = `Your "${offer.name}" offer already saves you more than this coupon.`;
    }
  }

  // Free delivery.
  const freeByOffer = qualifying.find((o) => o.type === "free_shipping");
  let shipping = baseShipping;
  let shippingNote: string | null = null;
  if (baseShipping === 0) shippingNote = null; // Free anyway: "Delivery FREE" says it once.
  else if (coupon?.freeShipping) { shipping = 0; shippingNote = `Free delivery with ${coupon.code}`; }
  else if (freeByOffer) { shipping = 0; shippingNote = freeByOffer.name; }

  // Total discount can't take the goods value below Re 1.
  const couponDiscount = coupon?.discount ?? 0;
  const maxDiscount = Math.max(0, subtotal - 100);
  const totalDiscount = offerDiscount + couponDiscount;
  if (totalDiscount > maxDiscount) {
    const over = totalDiscount - maxDiscount;
    if (coupon && coupon.discount >= over) coupon = { ...coupon, discount: coupon.discount - over };
    else {
      if (coupon) { offerDiscount -= over - coupon.discount; coupon = { ...coupon, discount: 0 }; }
      else offerDiscount -= over;
    }
  }

  const codFee = input.paymentMethod === "cod" ? input.codFee : 0;
  const finalCoupon = coupon?.discount ?? 0;
  const total = lines.length ? subtotal - offerDiscount - finalCoupon + shipping + codFee : 0;

  // Nudge: closest offer not yet unlocked, skipping free delivery when delivery is already free.
  // A higher tier is only a nudge if it beats what the buyer already gets.
  // For a piece-count offer, "beats" assumes the next piece costs about the same as the average one so far.
  const avg = pieces ? subtotal / pieces : 0;
  const nextRule = liveOffers
    .filter((o) => o.minSubtotal > subtotal || (o.minPieces ?? 0) > pieces)
    .filter((o) => !(o.type === "free_shipping" && (shipping === 0 || baseShipping === 0)))
    .filter((o) => o.type === "free_shipping" || ruleDiscount(o.type, o.value, Math.max(o.minSubtotal, subtotal + avg * Math.max(0, (o.minPieces ?? 0) - pieces)), o.maxDiscount) > offerDiscount)
    .sort((a, b) => (a.minPieces ?? 0) - (b.minPieces ?? 0) || a.minSubtotal - b.minSubtotal)[0];

  return {
    lines,
    subtotal,
    mrpTotal,
    savingsOnPrice: mrpTotal - subtotal,
    offer: offer && offerDiscount > 0 ? { name: offer.name, discount: offerDiscount } : null,
    coupon,
    couponError,
    shipping,
    shippingNote,
    codFee,
    total,
    totalSavings: mrpTotal - subtotal + offerDiscount + finalCoupon + (baseShipping - shipping),
    nextOffer: nextRule
      ? { name: nextRule.name, type: nextRule.type, value: nextRule.value, remaining: Math.max(0, nextRule.minSubtotal - subtotal), minSubtotal: nextRule.minSubtotal, piecesLeft: Math.max(0, (nextRule.minPieces ?? 0) - pieces), minPieces: nextRule.minPieces ?? 0 }
      : null,
    tiers: lines.length ? offerTiers(liveOffers, pieces, subtotal) : [],
    pieces,
  };
}
function rupees(p: number) {
  return `₹${Math.ceil(p / 100).toLocaleString("en-IN")}`;
}
/** Effective purchase cap: stock, per-order cap, and what the buyer has left of a lifetime cap. */
export function maxPurchasable(opts: { stock: number; maxPerOrder?: number | null; maxPerCustomer?: number | null; alreadyBought?: number }) {
  let cap = Math.max(0, opts.stock);
  if (opts.maxPerOrder != null) cap = Math.min(cap, opts.maxPerOrder);
  if (opts.maxPerCustomer != null) cap = Math.min(cap, Math.max(0, opts.maxPerCustomer - (opts.alreadyBought ?? 0)));
  return cap;
}
