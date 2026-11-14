import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProductGrid } from "@/components/store/product-grid";
import { requireCustomer } from "@/lib/auth";
import { getAllCards } from "@/lib/catalog";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default async function Wishlist() {
  const c = await requireCustomer("/account/wishlist");
  const rows = await db.select().from(schema.wishlist).where(eq(schema.wishlist.customerId, c.id));
  const ids = rows.map((r) => r.productId);
  const cards = (await getAllCards()).filter((p) => ids.includes(p.id));
  if (!cards.length) return (
    <div className="card p-10 text-center"><p className="text-lg font-semibold">Nothing saved yet</p><p className="mb-3 text-sm text-ink-soft">Tap the heart on anything you like.</p><Link href="/shop" className="btn btn-primary">Browse products</Link></div>
  );
  return <ProductGrid products={cards} wished={ids} />;
}
