import { and, asc, eq, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "./settings";

export async function orderBundleByToken(token: string) {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.accessToken, token));
  if (!order) return null;
  return bundle(order);
}
export async function bundle(order: typeof schema.orders.$inferSelect) {
  const [items, events] = await Promise.all([
    db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)),
    db.select().from(schema.orderEvents).where(and(eq(schema.orderEvents.orderId, order.id), eq(schema.orderEvents.public, true))).orderBy(asc(schema.orderEvents.createdAt)),
  ]);
  return { order, items, events };
}
/** Only OTP-verified identifiers are ever on a customer record, so matching on them is safe. */
export function customerOrderFilter(c: { id: string; email: string | null; phone: string | null }): SQL {
  const conds = [eq(schema.orders.customerId, c.id)];
  if (c.email) conds.push(eq(schema.orders.email, c.email));
  if (c.phone) conds.push(eq(schema.orders.phone, c.phone));
  return or(...conds)!;
}
export async function returnEligible(order: typeof schema.orders.$inferSelect, items: { productId: string }[]) {
  if (order.status !== "delivered" || !order.deliveredAt) return false;
  const s = await getSettings();
  if (Date.now() > order.deliveredAt + s.returnWindowDays * 86_400_000) return false;
  const prods = await db.select({ id: schema.products.id, returnable: schema.products.returnable }).from(schema.products);
  return items.some((i) => prods.find((p) => p.id === i.productId)?.returnable);
}
