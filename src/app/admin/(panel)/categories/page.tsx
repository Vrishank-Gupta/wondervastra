import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { CategoryManager } from "@/components/admin/category-manager";
import { PageHead } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Categories" };

export default async function Categories() {
  const [cats, counts] = await Promise.all([
    db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)),
    db.select({ id: schema.products.categoryId, n: sql<number>`count(*)` }).from(schema.products).where(eq(schema.products.status, "active")).groupBy(schema.products.categoryId),
  ]);
  return (
    <>
      <PageHead title="Categories" sub="A category with no live listings stays hidden, so you can prepare a new range in private." />
      <CategoryManager categories={cats.map((c) => ({ id: c.id, name: c.name, tagline: c.tagline ?? "", image: c.image ?? "", accent: c.accent, sortOrder: c.sortOrder, active: c.active, slug: c.slug, count: Number(counts.find((x) => x.id === c.id)?.n ?? 0) }))} />
    </>
  );
}
