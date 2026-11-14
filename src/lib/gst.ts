/**
 * GST breakup for a tax invoice, from tax-inclusive prices (everything in paise).
 *
 * Apparel rate depends on the selling price per piece (from 22 Sep 2025: up to ₹2,500 → 5%, above → 18%).
 * Cart discounts (offer + coupon) are shared across items in proportion to their value, because GST is on
 * the price actually charged. Delivery and COD fees follow the main supply, so they take the highest item rate.
 * Same state as the seller → CGST + SGST (half each); different state → IGST.
 */
export type GstRates = { lowRate: number; highRate: number; thresholdPaise: number };
export const DEFAULT_GST: GstRates = { lowRate: 5, highRate: 18, thresholdPaise: 250000 };

export type GstLine = { name: string; hsn: string | null; qty: number; gross: number; rate: number; taxable: number; tax: number };
export type GstBreakup = { lines: GstLine[]; taxable: number; tax: number; total: number; interState: boolean; cgst: number; sgst: number; igst: number };

const split = (gross: number, rate: number) => {
  const taxable = Math.round((gross * 100) / (100 + rate));
  return { taxable, tax: gross - taxable };
};

export function gstBreakup(input: {
  items: { name: string; hsnCode: string | null; unitPrice: number; qty: number }[];
  discount: number;
  charges: number;
  sellerState: string;
  buyerState: string;
  rates?: GstRates;
}): GstBreakup {
  const r = input.rates ?? DEFAULT_GST;
  const goods = input.items.reduce((a, i) => a + i.unitPrice * i.qty, 0);
  let left = input.discount;
  const lines: GstLine[] = input.items.map((i, n) => {
    const value = i.unitPrice * i.qty;
    // The last line takes the rounding remainder so the discount shares add up exactly.
    const share = n === input.items.length - 1 ? left : goods ? Math.round((input.discount * value) / goods) : 0;
    left -= share;
    const gross = value - share;
    const perPiece = i.qty ? gross / i.qty : 0;
    const rate = perPiece > r.thresholdPaise ? r.highRate : r.lowRate;
    return { name: i.name, hsn: i.hsnCode, qty: i.qty, gross, rate, ...split(gross, rate) };
  });
  if (input.charges > 0) {
    const rate = Math.max(r.lowRate, ...lines.map((l) => l.rate));
    lines.push({ name: "Delivery & handling", hsn: "996812", qty: 1, gross: input.charges, rate, ...split(input.charges, rate) });
  }
  const taxable = lines.reduce((a, l) => a + l.taxable, 0);
  const tax = lines.reduce((a, l) => a + l.tax, 0);
  const norm = (s: string) => s.trim().toLowerCase();
  const interState = !input.sellerState || norm(input.sellerState) !== norm(input.buyerState);
  const half = Math.floor(tax / 2);
  return {
    lines, taxable, tax, total: taxable + tax, interState,
    cgst: interState ? 0 : half, sgst: interState ? 0 : tax - half, igst: interState ? tax : 0,
  };
}

/** Financial year label for an invoice number, e.g. 14 Nov 2026 → "2026-27". */
export function financialYear(ms: number) {
  const d = new Date(ms + 5.5 * 3_600_000); // IST
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
