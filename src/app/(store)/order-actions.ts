"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCustomer } from "@/lib/auth";
import { addEvent, changeOrderStatus } from "@/lib/orders";
import { notifyOrder } from "@/lib/notifications";
import { returnEligible } from "@/lib/order-access";
import { newId } from "@/lib/utils";

async function byToken(token: string) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.accessToken, token));
  if (!o) throw new Error("Order not found");
  return o;
}

export async function cancelOrderAction(token: string): Promise<{ error?: string }> {
  const o = await byToken(token);
  if (o.status !== "confirmed") return { error: "This order has already moved ahead. Please contact us for help." };
  try {
    await changeOrderStatus(o.id, "cancelled", { actor: `${o.name} (customer)`, note: "by customer" });
  } catch (e) { return { error: (e as Error).message }; }
  if (o.paymentStatus === "paid") await addEvent(db, o.id, "attention", "⚠ Customer cancelled a paid order. Refund is due.");
  revalidatePath(`/order/${token}`);
  return {};
}

export async function requestReturnAction(token: string, reason: string, details: string): Promise<{ error?: string }> {
  const o = await byToken(token);
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  if (!(await returnEligible(o, items))) return { error: "This order isn't eligible for a return any more." };
  if (!reason) return { error: "Please pick a reason." };
  await db.insert(schema.returnRequests).values({ id: newId(), orderId: o.id, reason: reason.slice(0, 100), details: details.slice(0, 1000) || null });
  await changeOrderStatus(o.id, "return_requested", { actor: `${o.name} (customer)`, note: reason.slice(0, 100), silent: true });
  await notifyOrder(o.id, "return_update");
  revalidatePath(`/order/${token}`);
  return {};
}

export async function submitFeedbackAction(token: string, type: "order" | "delivery", rating: number, comment: string, productReviews: { productId: string; rating: number; body: string }[]): Promise<{ error?: string }> {
  const o = await byToken(token);
  if (rating < 1 || rating > 5) return { error: "Please choose a rating." };
  if (type === "delivery" && o.status !== "delivered" && o.status !== "returned" && o.status !== "return_requested") return { error: "You can rate this once your order is delivered." };
  await db.insert(schema.feedback).values({ id: newId(), orderId: o.id, type, rating: Math.round(rating), comment: comment.slice(0, 1000) || null })
    .onConflictDoUpdate({ target: [schema.feedback.orderId, schema.feedback.type], set: { rating: Math.round(rating), comment: comment.slice(0, 1000) || null } });
  if (type === "delivery") {
    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
    for (const r of productReviews) {
      if (!items.some((i) => i.productId === r.productId) || r.rating < 1 || r.rating > 5) continue;
      await db.insert(schema.reviews).values({
        id: newId(), productId: r.productId, orderId: o.id, name: o.name.split(" ")[0], rating: Math.round(r.rating), body: r.body.slice(0, 1000) || null, status: "pending",
      }).onConflictDoNothing();
    }
  }
  await addEvent(db, o.id, "feedback", `Customer left ${rating}★ ${type} feedback`);
  return {};
}

export async function reorderItems(orderToken: string) {
  const o = await byToken(orderToken);
  const items = await db.select({ variantId: schema.orderItems.variantId, qty: schema.orderItems.qty }).from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  return items;
}

export async function saveAddressAction(data: { id?: string; name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string; isDefault?: boolean }): Promise<{ error?: string }> {
  const c = await getCustomer();
  if (!c) return { error: "Please log in again." };
  if (!/^[1-9]\d{5}$/.test(data.pincode)) return { error: "Enter a valid 6-digit pincode." };
  const values = { customerId: c.id, name: data.name, phone: data.phone, line1: data.line1, line2: data.line2 || null, city: data.city, state: data.state, pincode: data.pincode, isDefault: Boolean(data.isDefault) };
  if (data.isDefault) await db.update(schema.addresses).set({ isDefault: false }).where(eq(schema.addresses.customerId, c.id));
  if (data.id) await db.update(schema.addresses).set(values).where(and(eq(schema.addresses.id, data.id), eq(schema.addresses.customerId, c.id)));
  else await db.insert(schema.addresses).values({ id: newId(), ...values });
  revalidatePath("/account/addresses");
  return {};
}
export async function deleteAddressAction(id: string) {
  const c = await getCustomer();
  if (!c) return;
  await db.delete(schema.addresses).where(and(eq(schema.addresses.id, id), eq(schema.addresses.customerId, c.id)));
  revalidatePath("/account/addresses");
}
