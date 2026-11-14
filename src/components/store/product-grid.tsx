import type { ProductCard as Card } from "@/lib/catalog";
import { ProductCard } from "./product-card";

export function ProductGrid({ products, wished = [], priorityCount = 0 }: { products: Card[]; wished?: string[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((p, i) => <ProductCard key={p.id} p={p} priority={i < priorityCount} wished={wished.includes(p.id)} />)}
    </div>
  );
}
