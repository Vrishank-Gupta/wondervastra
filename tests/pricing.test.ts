import { describe, expect, it } from "vitest";
import { bestSalePrice, maxPurchasable, priceCart, type OfferRule, type PriceLine, type SaleRule } from "../src/lib/pricing";
import { verifyPaymentSignature, verifyWebhookSignature } from "../src/lib/razorpay";
import { createHmac } from "node:crypto";

const NOW = 1_800_000_000_000;
const line = (o: Partial<PriceLine> = {}): PriceLine => ({
  key: "v1", productId: "p1", categoryId: "c1", basePrice: 30000, qty: 1, deliveryMode: "flat", deliveryCharge: 4900, ...o,
});
const base = { sales: [] as SaleRule[], offers: [] as OfferRule[], shippingCombine: "highest" as const, codFee: 3000, paymentMethod: "razorpay" as const, now: NOW };
const sale = (o: Partial<SaleRule> = {}): SaleRule => ({
  id: "s", name: "Winter", type: "percent", value: 20, scope: "all", targetIds: [], startsAt: NOW - 1000, endsAt: NOW + 1000, active: true, ...o,
});
const offer = (o: Partial<OfferRule> = {}): OfferRule => ({
  id: "o", name: "Free delivery over ₹499", type: "free_shipping", value: 0, minSubtotal: 49900, combinesWithCoupons: true, active: true, ...o,
});
const coupon = { code: "VIBE10", type: "percent" as const, value: 10, minSubtotal: 0, excludeSaleItems: false, active: true };

describe("sales", () => {
  it("applies only while live and in scope", () => {
    expect(bestSalePrice(30000, "p1", "c1", [sale()], NOW).price).toBe(24000);
    expect(bestSalePrice(30000, "p1", "c1", [sale({ endsAt: NOW - 1 })], NOW).price).toBe(30000);
    expect(bestSalePrice(30000, "p1", "c1", [sale({ startsAt: NOW + 1 })], NOW).price).toBe(30000);
    expect(bestSalePrice(30000, "p1", "c1", [sale({ scope: "category", targetIds: ["c2"] })], NOW).price).toBe(30000);
    expect(bestSalePrice(30000, "p1", "c1", [sale({ scope: "products", targetIds: ["p1"] })], NOW).price).toBe(24000);
    expect(bestSalePrice(30000, "p1", "c1", [sale({ scope: "brand", targetIds: ["b1"] })], NOW, "b1").price).toBe(24000);
    expect(bestSalePrice(30000, "p1", "c1", [sale({ scope: "brand", targetIds: ["b1"] })], NOW, "b2").price).toBe(30000);
    expect(bestSalePrice(30000, "p1", "c1", [sale({ scope: "brand", targetIds: ["b1"] })], NOW, null).price).toBe(30000);
  });
  it("picks the best sale and never goes under Re 1", () => {
    const r = bestSalePrice(30000, "p1", "c1", [sale({ value: 10 }), sale({ id: "b", name: "Best", value: 30 })], NOW);
    expect(r.price).toBe(21000);
    expect(r.sale?.name).toBe("Best");
    expect(bestSalePrice(5000, "p1", "c1", [sale({ type: "flat", value: 99999 })], NOW).price).toBe(100);
  });
});

describe("delivery", () => {
  it("charges the highest listing charge by default", () => {
    const q = priceCart({ ...base, lines: [line(), line({ key: "v2", productId: "p2", deliveryCharge: 7900 })] });
    expect(q.shipping).toBe(7900);
  });
  it("can sum the charges", () => {
    const q = priceCart({ ...base, shippingCombine: "sum", lines: [line(), line({ key: "v2", deliveryCharge: 7900 })] });
    expect(q.shipping).toBe(12800);
  });
  it("is free when every listing is free delivery", () => {
    expect(priceCart({ ...base, lines: [line({ deliveryMode: "free", deliveryCharge: 0 })] }).shipping).toBe(0);
  });
  it("mixed cart still pays the charged listing", () => {
    expect(priceCart({ ...base, lines: [line({ deliveryMode: "free" }), line({ key: "v2" })] }).shipping).toBe(4900);
  });
});

describe("cart offers", () => {
  it("unlocks free delivery exactly at the threshold", () => {
    expect(priceCart({ ...base, offers: [offer()], lines: [line({ basePrice: 49899 })] }).shipping).toBe(4900);
    expect(priceCart({ ...base, offers: [offer()], lines: [line({ basePrice: 49900 })] }).shipping).toBe(0);
  });
  it("gives a percent discount above X and respects the cap", () => {
    const o = offer({ type: "percent", value: 10, minSubtotal: 100000, maxDiscount: 15000, name: "10% off" });
    const q = priceCart({ ...base, offers: [o], lines: [line({ basePrice: 200000 })] });
    expect(q.offer?.discount).toBe(15000);
    expect(q.total).toBe(200000 - 15000 + 4900);
  });
  it("nudges with the next unlock and how far away it is", () => {
    const q = priceCart({ ...base, offers: [offer()], lines: [line()] });
    expect(q.nextOffer?.remaining).toBe(19900);
  });
  it("doesn't nudge free delivery when delivery is already free", () => {
    const q = priceCart({ ...base, offers: [offer()], lines: [line({ deliveryMode: "free" })] });
    expect(q.nextOffer).toBeNull();
  });
  it("non-combining offer: the buyer keeps whichever saves more", () => {
    const o = offer({ type: "percent", value: 5, minSubtotal: 0, combinesWithCoupons: false, name: "5% off" });
    const q = priceCart({ ...base, offers: [o], coupon, lines: [line({ basePrice: 100000 })] });
    expect(q.offer).toBeNull();
    expect(q.coupon?.discount).toBe(10000);
    const small = priceCart({ ...base, offers: [o], coupon: { ...coupon, value: 2 }, lines: [line({ basePrice: 100000 })] });
    expect(small.coupon).toBeNull();
    expect(small.offer?.discount).toBe(5000);
    expect(small.couponError).toMatch(/saves you more/);
  });
  it("ignores expired offers", () => {
    expect(priceCart({ ...base, offers: [offer({ endsAt: NOW - 1 })], lines: [line({ basePrice: 60000 })] }).shipping).toBe(4900);
  });
});

describe("coupons", () => {
  it("applies percent coupons on the sale price", () => {
    const q = priceCart({ ...base, sales: [sale()], coupon, lines: [line()] });
    expect(q.subtotal).toBe(24000);
    expect(q.coupon?.discount).toBe(2400);
    expect(q.total).toBe(24000 - 2400 + 4900);
  });
  it("enforces minimum spend and dates", () => {
    expect(priceCart({ ...base, coupon: { ...coupon, minSubtotal: 50000 }, lines: [line()] }).couponError).toMatch(/more/);
    expect(priceCart({ ...base, coupon: { ...coupon, endsAt: NOW - 1 }, lines: [line()] }).couponError).toMatch(/expired/);
  });
  it("can exclude items already on sale", () => {
    const q = priceCart({
      ...base, sales: [sale({ scope: "products", targetIds: ["p1"] })], coupon: { ...coupon, excludeSaleItems: true },
      lines: [line(), line({ key: "v2", productId: "p2" })],
    });
    expect(q.coupon?.discount).toBe(3000);
  });
  it("never takes goods below Re 1, and adds COD fee", () => {
    const q = priceCart({ ...base, coupon: { ...coupon, type: "flat", value: 9999999 }, paymentMethod: "cod", lines: [line({ deliveryMode: "free" })] });
    expect(q.total).toBe(100 + 3000);
  });
  it("free-delivery coupon zeroes shipping", () => {
    const q = priceCart({ ...base, coupon: { ...coupon, type: "free_shipping", value: 0 }, lines: [line()] });
    expect(q.shipping).toBe(0);
    expect(q.total).toBe(30000);
  });
});

describe("quantity caps", () => {
  it("takes the tightest of stock, per-order and remaining lifetime cap", () => {
    expect(maxPurchasable({ stock: 10 })).toBe(10);
    expect(maxPurchasable({ stock: 10, maxPerOrder: 3 })).toBe(3);
    expect(maxPurchasable({ stock: 2, maxPerOrder: 3 })).toBe(2);
    expect(maxPurchasable({ stock: 10, maxPerOrder: 5, maxPerCustomer: 4, alreadyBought: 3 })).toBe(1);
    expect(maxPurchasable({ stock: 10, maxPerCustomer: 4, alreadyBought: 9 })).toBe(0);
  });
});

describe("razorpay signatures", () => {
  it("accepts genuine and rejects forged payment signatures", () => {
    const sig = createHmac("sha256", "s3").update("order_1|pay_1").digest("hex");
    expect(verifyPaymentSignature("order_1", "pay_1", sig, "s3")).toBe(true);
    expect(verifyPaymentSignature("order_1", "pay_2", sig, "s3")).toBe(false);
    expect(verifyPaymentSignature("order_1", "pay_1", "nope", "s3")).toBe(false);
    expect(verifyPaymentSignature("order_1", "pay_1", sig, "")).toBe(false);
  });
  it("validates webhooks against the raw body", () => {
    const sig = createHmac("sha256", "wh").update('{"a":1}').digest("hex");
    expect(verifyWebhookSignature('{"a":1}', sig, "wh")).toBe(true);
    expect(verifyWebhookSignature('{"a": 1}', sig, "wh")).toBe(false);
  });
});
