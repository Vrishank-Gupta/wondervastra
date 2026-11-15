/** Return requests: approve (book a Delhivery pickup), reject, mark received and restock, finish after refund. */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import * as dl from "./delhivery";
import { notifyOrder } from "./notifications";
import { addEvent, changeOrderStatus } from "./orders";
import { getSettingsFresh } from "./settings";
import { parcelGrams, shippingReady } from "./shipping";
import { newId } from "./utils";

type Ret = typeof schema.returnRequests.$inferSelect;

async function load(returnId: string) {
  const [r] = await db.select().from(schema.returnRequests).where(eq(schema.returnRequests.id, returnId));
  if (!r) throw new Error("Return request not found.");
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, r.orderId));
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, r.orderId));
  return { r, o, items };
}

/** What the returned pieces are worth after the order's discounts: the suggested refund. */
export function returnValue(r: Pick<Ret, "items">, o: Pick<typeof schema.orders.$inferSelect, "subtotal" | "total" | "refundedTotal">, items: { id: string; unitPrice: number }[]) {
  const value = r.items.reduce((a, x) => a + (items.find((i) => i.id === x.itemId)?.unitPrice ?? 0) * x.qty, 0);
  const share = o.subtotal > 0 ? Math.min(1, o.total / o.subtotal) : 1;
  return Math.min(o.total - o.refundedTotal, Math.round((value * share) / 100) * 100);
}

/** Approve: books the Delhivery pickup when Delhivery is set up, otherwise the seller arranges it. */
export async function approveReturn(returnId: string, note: string, actor: string) {
  const { r, o, items } = await load(returnId);
  if (r.status !== "requested") throw new Error("This return has already been decided.");
  let awb: string | null = null;
  const s = await getSettingsFresh();
  if (shippingReady(s)) {
    const pieces = r.items.reduce((a, x) => a + x.qty, 0);
    const box = s.delhiveryBox.split(/\s*[x×]\s*/i).map(Number);
    awb = await dl.createReturnPickup({
      orderNumber: o.number, name: o.name, phone: o.phone, address: [o.line1, o.line2].filter(Boolean).join(", "), city: o.city, state: o.state, pincode: o.pincode,
      products: r.items.map((x) => { const i = items.find((it) => it.id === x.itemId); return `${i?.name ?? "Item"}${i?.variantLabel ? ` (${i.variantLabel})` : ""} x${x.qty}`; }).join(", "),
      quantity: pieces, grams: parcelGrams(s, pieces), box: { l: box[0] || 30, w: box[1] || 25, h: box[2] || 5 }, pickupName: s.delhiveryPickupName.trim(),
      seller: { name: s.legalName || s.storeName, address: s.businessAddress, gstin: s.gstin }, hsn: items[0]?.hsnCode ?? null, value: returnValue(r, o, items),
    });
  }
  await db.update(schema.returnRequests).set({ status: "approved", adminNote: note.trim() || null, pickupAwb: awb, pickupStatus: awb ? "Pickup booked" : null, decidedAt: Date.now(), updatedAt: Date.now() }).where(eq(schema.returnRequests.id, returnId));
  await addEvent(db, o.id, "return", awb ? `Return approved. Delhivery pickup booked, AWB ${awb}` : "Return approved. We'll arrange the pickup.", { actor, public: true, meta: { awb } });
  await notifyOrder(o.id, "return_update");
  return { awb };
}

export async function rejectReturn(returnId: string, reason: string, actor: string) {
  const { r, o } = await load(returnId);
  if (r.status !== "requested") throw new Error("This return has already been decided.");
  if (reason.trim().length < 5) throw new Error("Tell the customer why, in a few words. They'll see this.");
  await db.update(schema.returnRequests).set({ status: "rejected", adminNote: reason.trim().slice(0, 300), decidedAt: Date.now(), updatedAt: Date.now() }).where(eq(schema.returnRequests.id, returnId));
  if (o.status === "return_requested") await changeOrderStatus(o.id, "delivered", { actor, note: "return not accepted", silent: true });
  await addEvent(db, o.id, "return", `Return not accepted: ${reason.trim()}`, { actor, public: true });
  await notifyOrder(o.id, "return_update");
}

/** The parcel is back and checked: optionally put the returned pieces back in stock, and close the order as returned. */
export async function receiveReturn(returnId: string, restock: boolean, actor: string) {
  const { r, o, items } = await load(returnId);
  if (!["approved", "picked_up"].includes(r.status)) throw new Error("Mark a return received after it's approved.");
  await db.update(schema.returnRequests).set({ status: "received", receivedAt: Date.now(), updatedAt: Date.now() }).where(eq(schema.returnRequests.id, returnId));
  if (restock) {
    for (const x of r.items) {
      const i = items.find((it) => it.id === x.itemId);
      if (!i) continue;
      await db.update(schema.variants).set({ stock: sql`${schema.variants.stock} + ${x.qty}` }).where(eq(schema.variants.id, i.variantId));
      await db.insert(schema.stockMovements).values({ id: newId(), variantId: i.variantId, productId: i.productId, delta: x.qty, reason: "return_received", orderId: o.id, actor });
    }
    const { alertRestocked } = await import("./orders");
    await alertRestocked([o.id]).catch(() => {});
  }
  if (o.status === "return_requested") await changeOrderStatus(o.id, "returned", { actor, silent: true });
  await addEvent(db, o.id, "return", `Return received${restock ? " and put back in stock" : ""}`, { actor, public: true });
  await notifyOrder(o.id, "return_update");
}

/** After the refund goes out. */
export async function completeReturn(orderId: string) {
  const [r] = await db.select().from(schema.returnRequests).where(eq(schema.returnRequests.orderId, orderId)).orderBy(desc(schema.returnRequests.createdAt)).limit(1);
  if (r && r.status === "received") await db.update(schema.returnRequests).set({ status: "completed", updatedAt: Date.now() }).where(eq(schema.returnRequests.id, r.id));
}

/** Return pickups move to "Picked up" on their first scan. Arrival is confirmed by the seller after checking the items. */
export async function syncReturnPickups() {
  const open = await db.select().from(schema.returnRequests).where(and(inArray(schema.returnRequests.status, ["approved", "picked_up"])));
  const withAwb = open.filter((r) => r.pickupAwb);
  if (!withAwb.length || !dl.delhiveryConfigured()) return 0;
  let n = 0;
  for (let i = 0; i < withAwb.length; i += 50) {
    const batch = withAwb.slice(i, i + 50);
    for (const t of await dl.track(batch.map((r) => r.pickupAwb!))) {
      const r = batch.find((x) => x.pickupAwb === t.awb);
      if (!r || !t.status) continue;
      const line = [t.status, t.where && `at ${t.where}`].filter(Boolean).join(" ");
      if (line === r.pickupStatus) continue;
      n++;
      const s = t.status.toLowerCase();
      const pickedUp = r.status === "approved" && !/scheduled|pending|not picked|manifest|open/.test(s);
      await db.update(schema.returnRequests).set({ pickupStatus: line, status: pickedUp ? "picked_up" : r.status, updatedAt: Date.now() }).where(eq(schema.returnRequests.id, r.id));
      if (pickedUp) { await addEvent(db, r.orderId, "return", "Return picked up by Delhivery", { public: true }); await notifyOrder(r.orderId, "return_update"); }
      if (t.type.toUpperCase() === "DL" || s.includes("delivered")) await addEvent(db, r.orderId, "attention", "⚠ Return parcel delivered to you. Check the items and mark it received.");
    }
  }
  return n;
}
