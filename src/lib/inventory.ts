import { and, eq, inArray, or, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendBackInStock } from "./notifications";

const { products, variants, stockAlerts } = schema;

/** Messages everyone waiting on anything that is now purchasable. Each alert fires once. `launch` = a coming-soon listing just went live. */
export async function processStockAlerts(productId: string, launch = false) {
  const [p] = await db.select().from(products).where(eq(products.id, productId));
  if (!p || p.status !== "active" || p.forceOutOfStock || p.comingSoon) return 0;
  const vars = await db.select().from(variants).where(and(eq(variants.productId, productId), eq(variants.active, true)));
  const available = vars.filter((v) => v.stock > 0).map((v) => v.id);
  if (!available.length) return 0;
  const waiting = await db.select().from(stockAlerts).where(and(
    eq(stockAlerts.productId, productId), eq(stockAlerts.status, "waiting"),
    or(isNull(stockAlerts.variantId), inArray(stockAlerts.variantId, available)),
  ));
  for (const a of waiting) {
    const res = await db.update(stockAlerts).set({ status: "notified", notifiedAt: Date.now() })
      .where(and(eq(stockAlerts.id, a.id), eq(stockAlerts.status, "waiting")));
    if (res.rowsAffected) await sendBackInStock(a, p.name, p.slug, launch);
  }
  return waiting.length;
}
