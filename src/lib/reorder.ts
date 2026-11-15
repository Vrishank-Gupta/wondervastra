/**
 * "Order again" for an earlier order: the same pieces, and for kids' thermals the same pieces one size up
 * (children grow out of last winter's size). Only what's still on sale and in stock is offered.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export type ReorderLine = { variantId: string; qty: number; name: string; label: string };
export type Reorder = { same: ReorderLine[]; sizeUp: ReorderLine[]; missing: number; kids: boolean };

const isKids = (cat: { slug: string; name: string } | undefined, sizes: string[]) =>
  /kid|child|boy|girl/i.test(`${cat?.slug ?? ""} ${cat?.name ?? ""}`) || sizes.some((s) => /\d\s*Y\b/.test(s));

export async function reorderOptions(items: { productId: string; variantId: string; qty: number; name: string }[]): Promise<Reorder> {
  if (!items.length) return { same: [], sizeUp: [], missing: 0, kids: false };
  const pids = [...new Set(items.map((i) => i.productId))];
  const [prods, vars, cats] = await Promise.all([
    db.select().from(schema.products).where(inArray(schema.products.id, pids)),
    db.select().from(schema.variants).where(and(inArray(schema.variants.productId, pids), eq(schema.variants.active, true))).orderBy(asc(schema.variants.sortOrder)),
    db.select().from(schema.categories),
  ]);
  const buyable = (v: typeof vars[number] | undefined) => {
    const p = v && prods.find((x) => x.id === v.productId);
    return Boolean(v && p && p.status === "active" && !p.forceOutOfStock && !p.comingSoon && v.stock > 0);
  };
  const label = (v: typeof vars[number]) => [v.option2 !== "Default" ? v.option2 : "", v.option1 !== "Free size" ? `Size ${v.option1}` : ""].filter(Boolean).join(" · ");
  const same: ReorderLine[] = [], sizeUp: ReorderLine[] = [];
  let missing = 0, kids = false;
  for (const it of items) {
    const v = vars.find((x) => x.id === it.variantId);
    const p = prods.find((x) => x.id === it.productId);
    if (buyable(v)) same.push({ variantId: v!.id, qty: Math.min(it.qty, v!.stock), name: it.name, label: label(v!) });
    else missing++;
    if (!v || !p) continue;
    const line = vars.filter((x) => x.productId === v.productId && x.option2 === v.option2);
    if (!isKids(cats.find((c) => c.id === p.categoryId), line.map((x) => x.option1))) continue;
    kids = true;
    const up = line[line.findIndex((x) => x.id === v.id) + 1];
    if (buyable(up)) sizeUp.push({ variantId: up.id, qty: Math.min(it.qty, up.stock), name: it.name, label: label(up) });
  }
  return { same, sizeUp, missing, kids };
}
