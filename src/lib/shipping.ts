/** Delhivery for orders: book, label, cancel, pickups, and the tracking sync the cron job runs. */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OrderStatus } from "@/db/schema";
import * as dl from "./delhivery";
import { addEvent, changeOrderStatus } from "./orders";
import { getSettingsFresh, type StoreSettings } from "./settings";

export const DELHIVERY = "Delhivery";

/** Ready to book: a token, plus the pickup address name and pincode in Settings. */
export function shippingReady(s: Pick<StoreSettings, "delhiveryPickupName" | "delhiveryPickupPin">) {
  return dl.delhiveryConfigured() && Boolean(s.delhiveryPickupName.trim() && s.delhiveryPickupPin.trim());
}
export function parcelGrams(s: Pick<StoreSettings, "delhiveryPieceGrams">, pieces: number) {
  return Math.max(100, s.delhiveryPieceGrams * Math.max(1, pieces));
}
function box(s: Pick<StoreSettings, "delhiveryBox">) {
  const [l, w, h] = s.delhiveryBox.split(/\s*[x×]\s*/i).map(Number);
  return { l: l || 30, w: w || 25, h: h || 5 };
}

/** "Delivered by Tue, 18 Nov" for a pincode: dispatch days, then Delhivery's transit estimate. Null when unknown. */
export async function estimateDelivery(s: StoreSettings, toPin: string, now = new Date()) {
  if (!dl.delhiveryConfigured() || !/^[1-9]\d{5}$/.test(s.delhiveryPickupPin)) return null;
  const transit = await dl.transitDays(s.delhiveryPickupPin, toPin);
  return transit == null ? null : dl.etaDate(now, s.dispatchDays, transit).getTime();
}

/** Cost to us and expected date, shown on the order page before booking. */
export async function quoteShipment(orderId: string) {
  const s = await getSettingsFresh();
  if (!shippingReady(s)) return null;
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  const pieces = items.reduce((a, i) => a + i.qty, 0);
  const grams = parcelGrams(s, pieces);
  const [cost, transit] = await Promise.all([
    dl.shippingCost(s.delhiveryPickupPin, o.pincode, grams, o.paymentMethod === "cod").catch(() => null),
    dl.transitDays(s.delhiveryPickupPin, o.pincode),
  ]);
  return { grams, pieces, cost, transit };
}

export async function bookDelhivery(orderId: string, grams: number, actor: string) {
  const s = await getSettingsFresh();
  if (!shippingReady(s)) throw new Error("Add your Delhivery pickup address name and pincode in Settings first.");
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!o) throw new Error("Order not found");
  if (o.awb) throw new Error("This order already has an AWB. Cancel that shipment first to book a new one.");
  if (!["confirmed", "packed"].includes(o.status)) throw new Error("Only confirmed or packed orders can be booked.");
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  const quantity = items.reduce((a, i) => a + i.qty, 0);
  const awb = await dl.createShipment({
    orderNumber: o.number, name: o.name, phone: o.phone, address: [o.line1, o.line2].filter(Boolean).join(", "), city: o.city, state: o.state, pincode: o.pincode,
    cod: o.paymentMethod === "cod" && o.paymentStatus !== "paid", total: o.total - o.refundedTotal,
    products: items.map((i) => `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""} x${i.qty}`).join(", "), quantity,
    grams, box: box(s), pickupName: s.delhiveryPickupName.trim(),
    seller: { name: s.legalName || s.storeName, address: s.businessAddress, gstin: s.gstin }, hsn: items[0]?.hsnCode ?? null,
  });
  const [cost, transit] = await Promise.all([
    dl.shippingCost(s.delhiveryPickupPin, o.pincode, grams, o.paymentMethod === "cod").catch(() => null),
    dl.transitDays(s.delhiveryPickupPin, o.pincode),
  ]);
  const eta = transit == null ? null : dl.etaDate(new Date(), 0, transit + 1).getTime();
  await db.update(schema.orders).set({
    courier: DELHIVERY, awb, trackingUrl: dl.trackingLink(awb), courierStatus: "Booked, waiting for pickup", courierStatusAt: Date.now(),
    etaAt: eta, shippingCost: cost, updatedAt: Date.now(),
  }).where(eq(schema.orders.id, orderId));
  await addEvent(db, orderId, "shipment", `Booked with Delhivery, AWB ${awb}${cost != null ? ` (cost ₹${(cost / 100).toFixed(2)})` : ""}`, { actor, meta: { awb, grams, cost } });
  if (o.status === "confirmed") await changeOrderStatus(orderId, "packed", { actor });
  return { awb, cost, eta };
}

export async function cancelDelhivery(orderId: string, actor: string) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!o?.awb || o.courier !== DELHIVERY) throw new Error("This order has no Delhivery shipment.");
  if (!["confirmed", "packed"].includes(o.status)) throw new Error("The parcel has already left. Contact Delhivery to stop it.");
  await dl.cancelShipment(o.awb);
  await db.update(schema.orders).set({ courier: null, awb: null, trackingUrl: null, courierStatus: null, courierStatusAt: null, etaAt: null, shippingCost: null, updatedAt: Date.now() }).where(eq(schema.orders.id, orderId));
  await addEvent(db, orderId, "shipment", `Delhivery shipment ${o.awb} cancelled`, { actor, meta: { awb: o.awb } });
}

/**
 * Pulls the latest Delhivery scan for every open shipment: stores it, adds it to the customer's timeline when it
 * changes, moves the order forward (which messages the customer), and keeps the expected date fresh.
 */
export async function syncDelhivery() {
  if (!dl.delhiveryConfigured()) return { checked: 0, updated: 0 };
  const open = await db.select().from(schema.orders).where(and(
    eq(schema.orders.courier, DELHIVERY), isNotNull(schema.orders.awb),
    inArray(schema.orders.status, ["confirmed", "packed", "shipped", "out_for_delivery"]),
  ));
  let updated = 0;
  for (let i = 0; i < open.length; i += 50) {
    const batch = open.slice(i, i + 50);
    const scans = await dl.track(batch.map((o) => o.awb!));
    for (const t of scans) {
      const o = batch.find((x) => x.awb === t.awb);
      if (!o || !t.status) continue;
      const line = [t.status, t.where && `at ${t.where}`].filter(Boolean).join(" ") + (t.note ? `: ${t.note}` : "");
      const changed = line !== o.courierStatus;
      await db.update(schema.orders).set({ courierStatus: line, courierStatusAt: t.at ?? Date.now(), etaAt: t.expected ?? o.etaAt, updatedAt: Date.now() }).where(eq(schema.orders.id, o.id));
      if (!changed) continue;
      updated++;
      if (t.type.toUpperCase() === "RT" || /rto/i.test(t.status)) {
        await addEvent(db, o.id, "shipment", `Delhivery: returning to us (${line})`, { meta: t });
        continue;
      }
      const target = dl.orderStatusFor(t, o.status);
      if (target) {
        // A parcel that skipped "shipped" between checks gets that step first, so every message goes out in order.
        const path: OrderStatus[] = ["confirmed", "packed"].includes(o.status) && target !== "shipped" ? ["shipped", target] : [target];
        for (const step of path) await changeOrderStatus(o.id, step, { actor: "Delhivery" }).catch((e) => console.error("delhivery status", o.number, e));
      } else {
        await addEvent(db, o.id, "courier", `Delhivery: ${line}`, { public: true, meta: t });
      }
    }
  }
  const { syncReturnPickups } = await import("./returns");
  const returns = await syncReturnPickups().catch((e) => { console.error("return pickups", e); return 0; });
  return { checked: open.length, updated: updated + returns };
}
