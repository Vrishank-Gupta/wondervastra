import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { InventoryTable } from "@/components/admin/inventory-table";
import { PageHead } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Inventory" };

export default async function Inventory() {
  const v = schema.variants, p = schema.products;
  const [rows, alerts] = await Promise.all([
    db.select({ id: v.id, productId: p.id, name: p.name, option1: v.option1, option2: v.option2, sku: v.sku, stock: v.stock, threshold: p.lowStockThreshold, forceOut: p.forceOutOfStock, status: p.status })
      .from(v).innerJoin(p, eq(p.id, v.productId)).where(eq(v.active, true)).orderBy(asc(p.name), asc(v.sortOrder)),
    db.select({ productId: schema.stockAlerts.productId, variantId: schema.stockAlerts.variantId, n: sql<number>`count(*)` }).from(schema.stockAlerts).where(eq(schema.stockAlerts.status, "waiting")).groupBy(schema.stockAlerts.productId, schema.stockAlerts.variantId),
  ]);
  return (
    <>
      <PageHead title="Inventory" sub="Type new counts and save everything at once. Buyers waiting for a restock are messaged automatically." />
      <InventoryTable rows={rows.filter((r) => r.status !== "archived").map((r) => ({ ...r, waiting: alerts.filter((a) => a.productId === r.productId && (a.variantId === r.id || a.variantId === null)).reduce((s, a) => s + Number(a.n), 0) }))} />
    </>
  );
}
