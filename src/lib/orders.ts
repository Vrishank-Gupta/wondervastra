import { randomInt } from "node:crypto";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { quoteCart, type CartInput } from "./cart";
import { STATUS_LABEL } from "./format";
import { notifyOrder, type OrderEventName } from "./notifications";
import type { OrderStatus } from "@/db/schema";
import { newId, newToken } from "./utils";

const { orders, orderItems, orderEvents, variants, stockMovements, coupons } = schema;
const HOLD_MINUTES = 30;

export class CheckoutError extends Error {}

export type CheckoutInput = {
  items: CartInput[];
  couponCode?: string | null;
  paymentMethod: "razorpay" | "cod";
  name: string; email: string; phone: string;
  line1: string; line2?: string | null; city: string; state: string; pincode: string;
  customerNote?: string | null;
  whatsappOptIn: boolean;
  customerId?: string | null;
  utmSource?: string | null; utmCampaign?: string | null;
  /** Total the buyer saw. If it changed, we stop and show the new price rather than charge a surprise. */
  expectedTotal?: number;
};

function orderNumber() {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let out = "WV";
  for (let i = 0; i < 7; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export async function addEvent(
  tx: Tx | typeof db, orderId: string, type: string, message: string,
  opts: { actor?: string; public?: boolean; meta?: unknown } = {},
) {
  await tx.insert(orderEvents).values({
    id: newId(), orderId, type, message, actor: opts.actor ?? "system", public: opts.public ?? false, meta: opts.meta ?? null,
  });
}

/** Creates the order and atomically holds stock and coupon usage. Stock can never go negative. */
export async function createOrder(input: CheckoutInput) {
  const who = { customerId: input.customerId, email: input.email, phone: input.phone };
  const quote = await quoteCart(input.items, { couponCode: input.couponCode, paymentMethod: input.paymentMethod, who });
  const lines = quote.views.filter((v) => v.qty > 0);
  if (!lines.length) throw new CheckoutError(quote.views.find((v) => v.issue)?.issue ?? "Your cart is empty or these items just sold out.");
  const requested = new Map(input.items.map((i) => [i.variantId, i.qty]));
  const changed = quote.views.find((v) => v.qty !== (requested.get(v.variantId) ?? 0));
  if (changed) throw new CheckoutError(`${changed.name}: ${changed.issue ?? "quantity changed"}. Please review your cart.`);
  if (input.couponCode && quote.couponError) throw new CheckoutError(quote.couponError);
  if (input.paymentMethod === "cod" && !quote.codAvailable) throw new CheckoutError(quote.codReason ?? "Cash on delivery isn't available.");
  if (input.expectedTotal != null && input.expectedTotal !== quote.total) {
    throw new CheckoutError("Prices were updated just now. Please check the new total and try again.");
  }

  const id = newId();
  const number = orderNumber();
  const accessToken = newToken();
  const now = Date.now();
  const isCod = input.paymentMethod === "cod";

  await db.transaction(async (tx) => {
    for (const l of lines) {
      const res = await tx.update(variants).set({ stock: sql`${variants.stock} - ${l.qty}` })
        .where(and(eq(variants.id, l.variantId), gte(variants.stock, l.qty)));
      if (!res.rowsAffected) throw new CheckoutError(`${l.name} just sold out. Please review your cart.`);
      await tx.insert(stockMovements).values({
        id: newId(), variantId: l.variantId, productId: l.productId, delta: -l.qty, reason: "order_hold", orderId: id, actor: "system",
      });
    }
    if (quote.coupon) {
      const res = await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(and(eq(coupons.code, quote.coupon.code), sql`(${coupons.usageLimit} IS NULL OR ${coupons.usedCount} < ${coupons.usageLimit})`));
      if (!res.rowsAffected) throw new CheckoutError("This coupon has just been fully used.");
    }
    await tx.insert(orders).values({
      id, number, accessToken, customerId: input.customerId ?? null,
      name: input.name, email: input.email, phone: input.phone,
      line1: input.line1, line2: input.line2 ?? null, city: input.city, state: input.state, pincode: input.pincode,
      subtotal: quote.subtotal, mrpTotal: quote.mrpTotal,
      offerName: quote.offer?.name ?? null, offerDiscount: quote.offer?.discount ?? 0,
      couponCode: quote.coupon?.code ?? null, couponDiscount: quote.coupon?.discount ?? 0,
      shippingTotal: quote.shipping, shippingNote: quote.shippingNote, codFee: quote.codFee, total: quote.total,
      paymentMethod: input.paymentMethod, paymentStatus: "pending",
      status: isCod ? "confirmed" : "pending_payment",
      customerNote: input.customerNote ?? null, whatsappOptIn: input.whatsappOptIn,
      utmSource: input.utmSource ?? null, utmCampaign: input.utmCampaign ?? null,
      placedAt: isCod ? now : null,
    });
    await tx.insert(orderItems).values(lines.map((l) => ({
      id: newId(), orderId: id, productId: l.productId, variantId: l.variantId, name: l.name, variantLabel: l.variantLabel,
      sku: l.sku, hsnCode: l.hsnCode, image: l.image, unitPrice: l.unitPrice, unitMrp: l.unitMrp, saleName: l.saleName, qty: l.qty,
    })));
    if (isCod) await addEvent(tx, id, "placed", "Order placed (cash on delivery)", { public: true, actor: input.name });
    else await addEvent(tx, id, "created", `Checkout started, stock held for ${HOLD_MINUTES} minutes`, { actor: input.name });
  });

  if (isCod) await notifyOrder(id, "order_placed");
  return { id, number, accessToken, total: quote.total };
}

/** Puts held stock and coupon usage back. Safe to call repeatedly. */
async function releaseHold(tx: Tx, orderId: string, couponCode: string | null, reason: string, actor: string) {
  const claim = await tx.update(orders).set({ stockHeld: false }).where(and(eq(orders.id, orderId), eq(orders.stockHeld, true)));
  if (!claim.rowsAffected) return;
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const i of items) {
    await tx.update(variants).set({ stock: sql`${variants.stock} + ${i.qty}` }).where(eq(variants.id, i.variantId));
    await tx.insert(stockMovements).values({ id: newId(), variantId: i.variantId, productId: i.productId, delta: i.qty, reason, orderId, actor });
  }
  if (couponCode) {
    await tx.update(coupons).set({ usedCount: sql`max(${coupons.usedCount} - 1, 0)` }).where(eq(coupons.code, couponCode));
  }
}

/** Idempotent: the browser callback and the webhook can both arrive; only the first one wins. */
export async function markPaid(orderId: string, paymentId: string, actor: string) {
  const now = Date.now();
  const res = await db.update(orders)
    .set({ paymentStatus: "paid", razorpayPaymentId: paymentId, status: "confirmed", placedAt: now, updatedAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.paymentMethod, "razorpay"), sql`${orders.paymentStatus} IN ('pending','failed')`));
  if (!res.rowsAffected) return false;

  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  await db.transaction(async (tx) => {
    await addEvent(tx, orderId, "payment", `Payment received (${paymentId})`, { actor });
    await addEvent(tx, orderId, "placed", "Order confirmed", { public: true });
    // Payment landed after the stock hold expired: take the stock again, and flag if it's gone.
    if (!o.stockHeld) {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      let short = false;
      for (const i of items) {
        const r = await tx.update(variants).set({ stock: sql`${variants.stock} - ${i.qty}` })
          .where(and(eq(variants.id, i.variantId), gte(variants.stock, i.qty)));
        if (!r.rowsAffected) short = true;
        else await tx.insert(stockMovements).values({ id: newId(), variantId: i.variantId, productId: i.productId, delta: -i.qty, reason: "late_payment", orderId, actor: "system" });
      }
      await tx.update(orders).set({ stockHeld: true }).where(eq(orders.id, orderId));
      // The expired hold gave the coupon use back; the buyer did use it, so count it again.
      if (o.couponCode) await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.code, o.couponCode));
      await addEvent(tx, orderId, "attention", short ? "⚠ Paid after the stock hold expired and some items are short. Check stock and contact the buyer." : "Paid after the stock hold expired; stock taken again.", { actor: "system" });
    }
  });
  await notifyOrder(orderId, "order_placed");
  return true;
}

export async function markPaymentFailed(orderId: string, reason: string) {
  const res = await db.update(orders).set({ paymentStatus: "failed", updatedAt: Date.now() })
    .where(and(eq(orders.id, orderId), eq(orders.paymentStatus, "pending")));
  if (res.rowsAffected) await addEvent(db, orderId, "payment_failed", `Payment failed: ${reason}`);
}

/** Stock just came back for these orders' items: message anyone waiting for them. */
async function alertRestocked(orderIds: string[]) {
  if (!orderIds.length) return;
  const { processStockAlerts } = await import("./inventory");
  const items = await db.select({ productId: orderItems.productId }).from(orderItems).where(inArray(orderItems.orderId, orderIds));
  for (const pid of new Set(items.map((i) => i.productId))) await processStockAlerts(pid).catch((e) => console.error("stock alerts failed", e));
}

export async function expireUnpaidOrders() {
  const cutoff = Date.now() - HOLD_MINUTES * 60_000;
  const stale = await db.select().from(orders).where(and(eq(orders.status, "pending_payment"), lt(orders.createdAt, cutoff)));
  const released: string[] = [];
  for (const o of stale) {
    await db.transaction(async (tx) => {
      const res = await tx.update(orders).set({ status: "cancelled", updatedAt: Date.now() })
        .where(and(eq(orders.id, o.id), eq(orders.status, "pending_payment")));
      if (!res.rowsAffected) return;
      await releaseHold(tx, o.id, o.couponCode, "payment_timeout", "system");
      await addEvent(tx, o.id, "expired", "Unpaid checkout expired, stock released");
      released.push(o.id);
    });
  }
  await alertRestocked(released);
  return stale.length;
}

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["cancelled"],
  confirmed: ["packed", "shipped", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "returned"],
  out_for_delivery: ["delivered", "returned"],
  delivered: ["return_requested", "returned"],
  return_requested: ["returned", "delivered"],
  cancelled: [],
  returned: [],
};
const EVENT_FOR: Partial<Record<OrderStatus, OrderEventName>> = {
  packed: "order_packed",
  shipped: "order_shipped",
  out_for_delivery: "out_for_delivery",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
  returned: "return_update",
};
const PUBLIC_MESSAGE: Partial<Record<OrderStatus, string>> = {
  packed: "Packed and ready to ship",
  shipped: "Handed to the courier",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Order cancelled",
  return_requested: "Return requested",
  returned: "Return completed",
};

export async function changeOrderStatus(
  orderId: string,
  next: OrderStatus,
  opts: { actor: string; note?: string; restock?: boolean; silent?: boolean } = { actor: "system" },
) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new Error("Order not found");
  if (!TRANSITIONS[o.status].includes(next)) {
    throw new Error(`Can't move an order from ${STATUS_LABEL[o.status]} to ${STATUS_LABEL[next]}.`);
  }
  if (next === "shipped" && !o.awb && !o.trackingUrl) {
    throw new Error("Add an AWB number or tracking link before marking as shipped.");
  }
  const now = Date.now();
  await db.transaction(async (tx) => {
    const patch: Partial<typeof orders.$inferInsert> = { status: next, updatedAt: now };
    if (next === "shipped") patch.shippedAt = now;
    if (next === "delivered") {
      patch.deliveredAt = o.deliveredAt ?? now;
      // Cash collected on delivery.
      if (o.paymentMethod === "cod" && o.paymentStatus === "pending") patch.paymentStatus = "paid";
    }
    const res = await tx.update(orders).set(patch).where(and(eq(orders.id, orderId), eq(orders.status, o.status)));
    if (!res.rowsAffected) throw new Error("This order was just updated by someone else. Refresh and try again.");
    await addEvent(tx, orderId, "status", opts.note ? `${PUBLIC_MESSAGE[next] ?? STATUS_LABEL[next]} (${opts.note})` : PUBLIC_MESSAGE[next] ?? STATUS_LABEL[next], {
      actor: opts.actor, public: true, meta: { from: o.status, to: next },
    });
    if (next === "cancelled") await releaseHold(tx, orderId, o.couponCode, "order_cancelled", opts.actor);
    if (next === "returned" && opts.restock) await releaseHold(tx, orderId, null, "order_returned", opts.actor);
  });
  const ev = EVENT_FOR[next];
  if (next === "shipped") await ensureInvoiceNumber(orderId).catch((e) => console.error("invoice number", e));
  if (ev && !opts.silent) await notifyOrder(orderId, ev);
  if (next === "cancelled" || (next === "returned" && opts.restock)) await alertRestocked([orderId]);
}

/**
 * Gives the order its GST invoice number the first time an invoice is issued (printed or shipped).
 * Numbers run in sequence per financial year (WV/2026-27/00001, 00002…); the unique index stops duplicates,
 * and a clash from two simultaneous requests just retries with the next number.
 */
export async function ensureInvoiceNumber(orderId: string): Promise<string | null> {
  const { financialYear } = await import("./gst");
  for (let attempt = 0; attempt < 5; attempt++) {
    const [o] = await db.select({ n: orders.invoiceNumber, status: orders.status, placedAt: orders.placedAt }).from(orders).where(eq(orders.id, orderId));
    if (!o) return null;
    if (o.n) return o.n;
    if (o.status === "pending_payment" || o.status === "cancelled") return null;
    const now = Date.now();
    const prefix = `WV/${financialYear(now)}/`;
    const [{ last }] = await db.select({ last: sql<string | null>`max(${orders.invoiceNumber})` }).from(orders).where(sql`${orders.invoiceNumber} LIKE ${prefix + "%"}`);
    const next = `${prefix}${String((last ? Number(last.slice(prefix.length)) : 0) + 1).padStart(5, "0")}`;
    try {
      const res = await db.update(orders).set({ invoiceNumber: next, invoicedAt: now }).where(and(eq(orders.id, orderId), sql`${orders.invoiceNumber} IS NULL`));
      if (res.rowsAffected) return next;
    } catch { /* another order took this number at the same moment: try the next one */ }
  }
  throw new Error("Couldn't assign an invoice number. Please try again.");
}

export async function pendingOrderCount() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(orders).where(sql`${orders.status} IN ('confirmed','packed')`);
  return Number(n);
}
