"use client";
import { useEffect, useState } from "react";
import type { ProductCard as Card } from "@/lib/catalog";
import { ProductCard } from "./product-card";

const KEY = "vv_recent";

export function RecentlyViewed({ currentId }: { currentId: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(() => {
    let ids: string[] = [];
    try { ids = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { /* ignore */ }
    const others = ids.filter((i) => i !== currentId).slice(0, 4);
    try { localStorage.setItem(KEY, JSON.stringify([currentId, ...others].slice(0, 12))); } catch { /* ignore */ }
    if (others.length) {
      fetch(`/api/products/by-ids?ids=${others.join(",")}`).then((r) => r.json()).then(setCards).catch(() => {});
    }
  }, [currentId]);
  if (!cards.length) return null;
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-3xl">Recently viewed</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((p) => <ProductCard key={p.id} p={p} />)}
      </div>
    </section>
  );
}
