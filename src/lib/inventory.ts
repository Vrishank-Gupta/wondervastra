import { and, eq, inArray, or, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendBackInStock, whatsappConfigured } from "./notifications";
import { siteUrl } from "./utils";

const { products, variants, stockAlerts } = schema;

/** Messages everyone waiting on anything that is now purchasable. Each alert fires once. `launch` = a coming-soon listing just went live. */
export type AlertResult = { sent: number; manual: number };
/** "2 waiting customers notified. 1 left only a phone number: message them from the Dashboard." */
export function alertNote(r: AlertResult, launched = false) {
  const parts = [];
  if (r.sent) parts.push(`${r.sent} waiting ${r.sent === 1 ? "customer" : "customers"} notified it's ${launched ? "now available" : "back in stock"}.`);
  if (r.manual) parts.push(`${r.manual} left only a phone number: message them from the Dashboard.`);
  return parts.join(" ");
}
export async function processStockAlerts(productId: string, launch = false): Promise<AlertResult> {
  const none = { sent: 0, manual: 0 };
  const [p] = await db.select().from(products).where(eq(products.id, productId));
  if (!p || p.status !== "active" || p.forceOutOfStock || p.comingSoon) return none;
  const vars = await db.select().from(variants).where(and(eq(variants.productId, productId), eq(variants.active, true)));
  const available = vars.filter((v) => v.stock > 0).map((v) => v.id);
  if (!available.length) return none;
  const waiting = await db.select().from(stockAlerts).where(and(
    eq(stockAlerts.productId, productId), eq(stockAlerts.status, "waiting"),
    or(isNull(stockAlerts.variantId), inArray(stockAlerts.variantId, available)),
  ));
  const canWhatsapp = whatsappConfigured();
  const out = { sent: 0, manual: 0 };
  for (const a of waiting) {
    // Phone-only alerts can't be sent until WhatsApp is connected: they wait in the admin for a manual message.
    const manual = !a.email && !canWhatsapp;
    const res = await db.update(stockAlerts).set({ status: manual ? "to_message" : "notified", notifiedAt: Date.now() })
      .where(and(eq(stockAlerts.id, a.id), eq(stockAlerts.status, "waiting")));
    if (!res.rowsAffected) continue;
    if (manual) out.manual++;
    else { out.sent++; await sendBackInStock(a, p.name, p.slug, launch); }
  }
  return out;
}

/** Restock alerts the owner has to send by hand (phone only, WhatsApp not connected). */
export async function restocksToMessage(productId?: string) {
  const rows = await db.select({ id: stockAlerts.id, phone: stockAlerts.phone, product: products.name, slug: products.slug, size: variants.option1 })
    .from(stockAlerts).innerJoin(products, eq(products.id, stockAlerts.productId)).leftJoin(variants, eq(variants.id, stockAlerts.variantId))
    .where(and(eq(stockAlerts.status, "to_message"), productId ? eq(stockAlerts.productId, productId) : undefined));
  return rows.filter((r) => r.phone).map((r) => ({ id: r.id, phone: r.phone!, product: r.product, url: `${siteUrl()}/p/${r.slug}?utm_source=back_in_stock`, size: r.size && r.size !== "Free size" ? r.size : null }));
}
