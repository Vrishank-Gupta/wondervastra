import { NextResponse } from "next/server";
import { applyFilters, getAllCards } from "@/lib/catalog";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80);
  if (!q) return NextResponse.json([]);
  const results = applyFilters(await getAllCards(), { q }).slice(0, 6);
  return NextResponse.json(results.map((r) => ({ name: r.name, slug: r.slug, image: r.images[0]?.url ?? null, price: r.price, category: r.categoryName })));
}
