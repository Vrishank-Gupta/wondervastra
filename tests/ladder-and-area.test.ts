import { describe, expect, it } from "vitest";
import { deliversTo, NCR_PINCODES, ncrPlace, parsePincodes } from "../src/lib/delivery-area";
import { offerTiers, priceCart, type OfferRule, type PriceLine } from "../src/lib/pricing";

const NOW = 1_800_000_000_000;
const line = (basePrice: number, qty = 1): PriceLine => ({ key: `v${basePrice}`, productId: "p", categoryId: "c", basePrice, qty, deliveryMode: "flat", deliveryCharge: 4900 });
const pct = (min: number, value: number): OfferRule => ({ id: `o${min}`, name: `${value}% off above ₹${min / 100}`, type: "percent", value, minSubtotal: min, combinesWithCoupons: true, active: true });
const LADDER = [pct(50000, 5), pct(100000, 7), pct(200000, 10), pct(400000, 12), pct(500000, 15), { ...pct(79900, 0), id: "free", name: "Free delivery", type: "free_shipping" as const }];
const quote = (lines: PriceLine[]) => priceCart({ lines, sales: [], offers: LADDER, shippingCombine: "highest", codFee: 0, paymentMethod: "cod", now: NOW });

describe("delivery area", () => {
  it("covers Delhi NCR and nothing else by default", () => {
    for (const pin of ["110001", "110017", "110096", "122002", "122018", "201301", "201310", "201014", "121002", "201102"]) expect(deliversTo(pin, NCR_PINCODES), pin).toBe(true);
    for (const pin of ["400001", "560001", "302001", "122505", "250001", "201206"]) expect(deliversTo(pin, NCR_PINCODES), pin).toBe(false);
  });
  it("reads pincodes, ranges and prefixes, and reports anything else", () => {
    const { rules, bad } = parsePincodes("110017, 400001-400010\n56 // Bengaluru\nabc 1234567");
    expect(rules).toHaveLength(3);
    expect(bad).toEqual(["abc", "1234567"]);
    expect(deliversTo("560034", "56")).toBe(true);
    expect(deliversTo("400005", "400001-400010")).toBe(true);
    expect(deliversTo("400011", "400001-400010")).toBe(false);
  });
  it("delivers everywhere when the list is blank, and never to a malformed pincode", () => {
    expect(deliversTo("695001", "")).toBe(true);
    expect(deliversTo("012345", "")).toBe(false);
    expect(deliversTo("11001", NCR_PINCODES)).toBe(false);
  });
  it("names NCR places", () => {
    expect(ncrPlace("122001")).toBe("Gurugram");
    expect(ncrPlace("201308")).toBe("Greater Noida");
    expect(ncrPlace("400001")).toBeNull();
  });
});

describe("buy more, save more", () => {
  it("lists every reward in order", () => {
    expect(offerTiers(LADDER).map((t) => t.reward)).toEqual(["5% off", "Free delivery", "7% off", "10% off", "12% off", "15% off"]);
  });
  it("gives the best reached step and nudges to the next one", () => {
    const q = quote([line(60000)]);
    expect(q.offer?.discount).toBe(3000);
    expect(q.nextOffer).toMatchObject({ type: "free_shipping", remaining: 19900 });
    expect(q.tiers.filter((t) => t.reached)).toHaveLength(1);
    const q2 = quote([line(110000)]);
    expect(q2.offer?.discount).toBe(7700);
    expect(q2.shipping).toBe(0);
    expect(q2.nextOffer).toMatchObject({ value: 10, remaining: 90000 });
  });
  it("stops nudging after the top step", () => {
    const q = quote([line(260000, 2)]);
    expect(q.offer?.discount).toBe(78000);
    expect(q.nextOffer).toBeNull();
    expect(q.tiers.every((t) => t.reached)).toBe(true);
  });
  it("doesn't nudge towards a step that saves less than the buyer already gets", () => {
    const offers: OfferRule[] = [pct(100000, 10), { ...pct(300000, 0), id: "flat", type: "flat", value: 5000 }];
    const q = priceCart({ lines: [line(150000)], sales: [], offers, shippingCombine: "highest", codFee: 0, paymentMethod: "cod", now: NOW });
    expect(q.nextOffer).toBeNull();
  });
});
