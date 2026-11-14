import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProductForm } from "@/components/admin/product-form";
import { PageHead } from "@/components/admin/ui";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "New listing" };

export default async function NewProduct() {
  const [cats, brands, s] = await Promise.all([db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)), db.select().from(schema.brands).orderBy(asc(schema.brands.sortOrder), asc(schema.brands.name)), getSettings()]);
  return (
    <>
      <PageHead title="New listing" />
      <ProductForm categories={cats.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }))} brands={brands.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name, isHouse: b.isHouse }))} initial={{
        name: "", slug: "", shortDescription: "", description: "", categoryId: cats.filter((c) => c.active).length === 1 ? cats.find((c) => c.active)!.id : "", brandId: "", status: "draft", price: "", compareAtPrice: "", tags: "", featured: false,
        material: "", care: "", sizeGuide: "", option1Label: "Size", option2Label: "Colour", deliveryMode: "flat", deliveryCharge: String(s.defaultDeliveryCharge / 100),
        codAllowed: true, returnable: true, forceOutOfStock: false, comingSoon: false, launchNote: "", showStockCount: true, maxPerOrder: "", maxPerCustomer: "", lowStockThreshold: "5", hsnCode: "", seoTitle: "", seoDescription: "",
        images: [], variants: [{ sku: "", option1: "Free size", option2: "Default", colorHex: "", price: "", stock: "0", active: true }],
      }} />
    </>
  );
}
