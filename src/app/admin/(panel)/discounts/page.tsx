import type { Metadata } from "next";
import { asc, desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { DiscountManager } from "@/components/admin/discount-manager";
import { PageHead } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Discounts & sales" };

export default async function Discounts() {
  const [sales, coupons, offers, cats, brands, prods] = await Promise.all([
    db.select().from(schema.sales).orderBy(desc(schema.sales.createdAt)),
    db.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt)),
    db.select().from(schema.cartOffers).orderBy(asc(schema.cartOffers.minSubtotal)),
    db.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories),
    db.select({ id: schema.brands.id, name: schema.brands.name }).from(schema.brands).orderBy(asc(schema.brands.sortOrder), asc(schema.brands.name)),
    db.select({ id: schema.products.id, name: schema.products.name }).from(schema.products).orderBy(asc(schema.products.name)),
  ]);
  return (
    <>
      <PageHead title="Discounts & sales" sub="Sales lower listing prices, cart offers reward bigger carts automatically, and coupons are codes you share." />
      <DiscountManager sales={sales} coupons={coupons} offers={offers} categories={cats} brands={brands} products={prods} />
    </>
  );
}
