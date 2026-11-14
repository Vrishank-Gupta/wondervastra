import Link from "next/link";
import { SearchX } from "lucide-react";
import { Suspense } from "react";
import { applyFilters, type Filters, type ProductCard } from "@/lib/catalog";
import { DesktopFilters, MobileFilters, SortSelect, type FacetData } from "./filters";
import { ProductGrid } from "./product-grid";
import { getCustomer } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function filtersFromParams(sp: SP): Filters {
  const num = (k: string) => { const n = Number(one(sp[k])); return one(sp[k]) && Number.isFinite(n) ? n : undefined; };
  return {
    q: one(sp.q)?.slice(0, 80), brand: one(sp.brand)?.slice(0, 200), collection: one(sp.collection), sort: one(sp.sort), color: one(sp.color), size: one(sp.size),
    min: num("min"), max: num("max"), onSale: one(sp.onSale) === "1", inStock: one(sp.inStock) === "1", freeDelivery: one(sp.freeDelivery) === "1",
  };
}
export function facetsFrom(cards: ProductCard[]): FacetData {
  const colors = new Map<string, string | null>();
  const sizes = new Set<string>();
  const brands = new Map<string, string>();
  cards.forEach((c) => { if (c.brandSlug && c.brandName) brands.set(c.brandSlug, c.brandName); });
  cards.forEach((c) => { c.colors.forEach((x) => colors.set(x.name, x.hex)); c.sizes.forEach((s) => sizes.add(s)); });
  return { brands: [...brands].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)), colors: [...colors].map(([name, hex]) => ({ name, hex })), sizes: [...sizes], maxPrice: Math.max(0, ...cards.map((c) => c.price)) };
}
export async function wishedIds() {
  const c = await getCustomer();
  if (!c) return [];
  const rows = await db.select({ id: schema.wishlist.productId }).from(schema.wishlist).where(eq(schema.wishlist.customerId, c.id));
  return rows.map((r) => r.id);
}

/** Shared results layout: filters sidebar / bottom sheet, sort, grid and a useful empty state. */
export async function Listing({ cards, filters, empty }: { cards: ProductCard[]; filters: Filters; empty?: { title: string; text: string } }) {
  const results = applyFilters(cards, filters);
  const filtered = Object.entries(filters).some(([k, v]) => k !== "sort" && k !== "collection" && v !== undefined && v !== false && v !== "");
  const facets = facetsFrom(cards);
  const wished = await wishedIds();
  return (
    <Suspense>
      <div className="flex gap-6">
        <DesktopFilters facets={facets} />
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-sm text-ink-soft" aria-live="polite">{results.length} {results.length === 1 ? "item" : "items"}</p>
            <div className="flex items-center gap-2"><MobileFilters facets={facets} count={results.length} /><SortSelect /></div>
          </div>
          {results.length ? <ProductGrid products={results} wished={wished} priorityCount={4} /> : (
            <div className="card flex flex-col items-center gap-3 p-10 text-center">
              <SearchX size={32} strokeWidth={1.25} aria-hidden />
              <p className="font-display text-2xl">{filters.q ? `Nothing found for “${filters.q}”` : filtered ? "No items match these filters" : empty?.title ?? "Nothing here yet"}</p>
              <p className="text-sm text-ink-soft">{filters.q || filtered ? "Try a broader search, or browse everything we have." : empty?.text ?? "New stock is on the way. Have a look at everything else we have."}</p>
              <Link href="/shop" className="btn btn-primary">See all products</Link>
            </div>
          )}
        </div>
      </div>
    </Suspense>
  );
}
