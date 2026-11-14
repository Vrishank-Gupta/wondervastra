import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { BrandManager } from "@/components/admin/brand-manager";
import { PageHead } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Brands" };

export default async function Brands() {
  const [brands, counts] = await Promise.all([
    db.select().from(schema.brands).orderBy(asc(schema.brands.sortOrder), asc(schema.brands.name)),
    db.select({ id: schema.products.brandId, n: sql<number>`count(*)` }).from(schema.products).where(eq(schema.products.status, "active")).groupBy(schema.products.brandId),
  ]);
  return (
    <>
      <PageHead title="Brands" sub="Partner brands you stock and your own label. A brand with no live listings stays hidden from the store." />
      <BrandManager brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name, tagline: b.tagline ?? "", logo: b.logo ?? "", image: b.image ?? "", isHouse: b.isHouse, sortOrder: b.sortOrder, active: b.active, count: Number(counts.find((x) => x.id === b.id)?.n ?? 0) }))} />
    </>
  );
}
