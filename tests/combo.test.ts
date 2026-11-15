import { describe, expect, it } from "vitest";
import { belowMinimum } from "@/lib/cart";

const kids = { minPieces: 2, comboAbove: 150000 };

describe("kids' wear sold in 2s", () => {
  it("one piece is too few, unless the whole cart is above ₹1,500", () => {
    expect(belowMinimum(kids, 1, 25000)).toBe(true);
    expect(belowMinimum(kids, 1, 150000)).toBe(true); // "above", not "at"
    expect(belowMinimum(kids, 1, 150100)).toBe(false);
    expect(belowMinimum(kids, 2, 50000)).toBe(false);
  });
  it("listings sold singly are unaffected", () => {
    expect(belowMinimum({ minPieces: 1, comboAbove: null }, 1, 100)).toBe(false);
  });
});

import { priceCart, type OfferRule, type PriceLine, type SaleRule } from "@/lib/pricing";
const pick = (n: number, pct: number): OfferRule => ({ id: `p${n}`, name: `Pick any ${n}`, type: "percent", value: pct, minSubtotal: 0, minPieces: n, combinesWithCoupons: true, active: true });
const ladder = [pick(3, 3), pick(4, 4), pick(5, 5)];
const line = (key: string, price: number, qty: number): PriceLine => ({ key, productId: key, categoryId: "c", basePrice: price, qty, deliveryMode: "free", deliveryCharge: 0 });
const cart = (lines: PriceLine[]) => priceCart({ lines, sales: [], offers: ladder, shippingCombine: "highest", codFee: 0, paymentMethod: "razorpay", now: 1 });

describe("pick any 3 / 4 / 5", () => {
  it("counts every piece in the cart, any items", () => {
    expect(cart([line("a", 25000, 2)]).offer).toBeNull();
    expect(cart([line("a", 25000, 2)]).nextOffer).toMatchObject({ piecesLeft: 1, value: 3 });
    expect(cart([line("a", 25000, 2), line("b", 35500, 1)]).offer).toEqual({ name: "Pick any 3", discount: 2600 });
    expect(cart([line("a", 25000, 4)]).offer?.discount).toBe(4000);
    expect(cart([line("a", 10000, 7)]).offer).toEqual({ name: "Pick any 5", discount: 3500 });
    expect(cart([line("a", 10000, 7)]).nextOffer).toBeNull();
  });
  it("shows every step with what's reached", () => {
    const t = cart([line("a", 10000, 4)]).tiers;
    expect(t.map((x) => `${x.label}:${x.reward}:${x.reached}`)).toEqual(["Pick any 3:3% off:true", "Pick any 4:4% off:true", "Pick any 5:5% off:false"]);
  });
});

describe("minimum-price sale", () => {
  const weekend: SaleRule = { id: "w", name: "Weekend sale", type: "min_price", value: 1, scope: "all", targetIds: [], startsAt: 0, endsAt: 10, active: true };
  const l = (minPrice: number | null): PriceLine => ({ key: "k", productId: "p", categoryId: "c", basePrice: 25000, minPrice, qty: 1, deliveryMode: "free", deliveryCharge: 0 });
  const run = (lines: PriceLine[], sales: SaleRule[], now = 5) => priceCart({ lines, sales, offers: [], shippingCombine: "highest", codFee: 0, paymentMethod: "razorpay", now });
  it("drops each size to its own minimum price only while the sale is live", () => {
    expect(run([l(23000)], [weekend]).subtotal).toBe(23000);
    expect(run([l(23000)], [weekend], 11).subtotal).toBe(25000);
    expect(run([l(23000)], []).subtotal).toBe(25000);
  });
  it("leaves sizes without a minimum price at their normal price", () => {
    expect(run([l(null)], [weekend]).subtotal).toBe(25000);
  });
});
