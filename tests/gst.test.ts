import { describe, expect, it } from "vitest";
import { financialYear, gstBreakup } from "../src/lib/gst";

describe("GST breakup", () => {
  it("splits tax-inclusive prices at 5% within the seller's state as CGST + SGST", () => {
    const b = gstBreakup({ items: [{ name: "Thermal", hsnCode: "6111", unitPrice: 52500, qty: 2 }], discount: 0, charges: 0, sellerState: "Karnataka", buyerState: "karnataka" });
    expect(b.lines[0].rate).toBe(5);
    expect(b.lines[0].taxable).toBe(100000); // ₹1,050 incl. 5% → ₹1,000 + ₹50
    expect(b.tax).toBe(5000);
    expect(b.interState).toBe(false);
    expect(b.cgst + b.sgst).toBe(5000);
    expect(b.igst).toBe(0);
  });
  it("uses IGST across states, 18% above ₹2,500 a piece, and the highest rate for delivery", () => {
    const b = gstBreakup({ items: [{ name: "Jacket", hsnCode: null, unitPrice: 300000, qty: 1 }, { name: "Socks", hsnCode: null, unitPrice: 20000, qty: 1 }], discount: 0, charges: 4900, sellerState: "Karnataka", buyerState: "Delhi" });
    expect(b.lines.map((l) => l.rate)).toEqual([18, 5, 18]);
    expect(b.interState).toBe(true);
    expect(b.igst).toBe(b.tax);
    expect(b.total).toBe(300000 + 20000 + 4900);
  });
  it("shares cart discounts across items so the invoice adds up to what was charged", () => {
    const b = gstBreakup({ items: [{ name: "A", hsnCode: null, unitPrice: 54900, qty: 1 }, { name: "B", hsnCode: null, unitPrice: 29900, qty: 3 }], discount: 5500, charges: 4900, sellerState: "Karnataka", buyerState: "Karnataka" });
    expect(b.total).toBe(54900 + 89700 - 5500 + 4900);
    expect(b.lines.slice(0, 2).reduce((a, l) => a + l.gross, 0)).toBe(54900 + 89700 - 5500);
  });
  it("labels the Indian financial year (April to March)", () => {
    expect(financialYear(Date.UTC(2026, 10, 14))).toBe("2026-27");
    expect(financialYear(Date.UTC(2027, 2, 31, 12))).toBe("2026-27");
    expect(financialYear(Date.UTC(2027, 3, 1, 12))).toBe("2027-28");
  });
});
