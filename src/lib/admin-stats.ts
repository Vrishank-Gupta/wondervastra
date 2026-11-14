import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const IST = 5.5 * 3_600_000;
const DAY = 86_400_000;
export const istDay = (ms: number) => Math.floor((ms + IST) / DAY);
export const startOfIstDay = (ms: number) => istDay(ms) * DAY - IST;

/** Orders that count as real sales: placed and not cancelled. */
const REAL = sql`${schema.orders.status} NOT IN ('pending_payment','cancelled')`;
/** For "what sold": returned items came back, so they don't count. */
const KEPT = sql`${schema.orders.status} NOT IN ('pending_payment','cancelled','returned')`;

export async function dashboardStats() {
  const now = Date.now();
  const since = startOfIstDay(now) - 29 * DAY;
  const o = schema.orders;
  const rows = await db.select({ createdAt: o.createdAt, total: o.total, refunded: o.refundedTotal, source: o.utmSource, method: o.paymentMethod }).from(o).where(and(REAL, gte(o.createdAt, since)));

  const today = istDay(now);
  const buckets = Array.from({ length: 30 }, (_, i) => ({ day: today - 29 + i, revenue: 0, orders: 0 }));
  const sources = new Map<string, { revenue: number; orders: number }>();
  for (const r of rows) {
    const b = buckets.find((x) => x.day === istDay(r.createdAt));
    const net = r.total - r.refunded;
    if (b) { b.revenue += net; b.orders += 1; }
    const key = r.source?.toLowerCase() || "direct";
    const s = sources.get(key) ?? { revenue: 0, orders: 0 };
    s.revenue += net; s.orders += 1;
    sources.set(key, s);
  }
  const sum = (arr: typeof buckets) => arr.reduce((a, b) => ({ revenue: a.revenue + b.revenue, orders: a.orders + b.orders }), { revenue: 0, orders: 0 });
  const t = sum(buckets.slice(-1));
  const week = sum(buckets.slice(-7));
  const month = sum(buckets);

  const n = sql<number>`count(*)`;
  const [toShip] = await db.select({ n }).from(o).where(inArray(o.status, ["confirmed", "packed"]));
  const [inTransit] = await db.select({ n }).from(o).where(inArray(o.status, ["shipped", "out_for_delivery"]));
  const [returns] = await db.select({ n }).from(o).where(eq(o.status, "return_requested"));
  const [refundDue] = await db.select({ n }).from(o).where(and(eq(o.status, "cancelled"), eq(o.paymentStatus, "paid")));
  const [abandoned] = await db.select({ n, v: sql<number>`coalesce(sum(${o.total}),0)` }).from(o).where(and(eq(o.status, "cancelled"), eq(o.paymentMethod, "razorpay"), sql`${o.placedAt} IS NULL`, gte(o.createdAt, since)));

  const top = await db.select({ name: schema.orderItems.name, qty: sql<number>`sum(${schema.orderItems.qty})`, revenue: sql<number>`sum(${schema.orderItems.qty} * ${schema.orderItems.unitPrice})` })
    .from(schema.orderItems).innerJoin(o, eq(o.id, schema.orderItems.orderId)).where(and(KEPT, gte(o.createdAt, since)))
    .groupBy(schema.orderItems.productId, schema.orderItems.name).orderBy(sql`3 desc`).limit(5);

  const v = schema.variants, p = schema.products;
  // One line per listing (not per size/colour), worst first.
  const lowRows = await db.select({ id: p.id, name: p.name, option1: v.option1, option2: v.option2, stock: v.stock })
    .from(v).innerJoin(p, eq(p.id, v.productId)).where(and(eq(p.status, "active"), eq(v.active, true), sql`${v.stock} <= ${p.lowStockThreshold}`)).orderBy(v.stock);
  const byProduct = new Map<string, { id: string; name: string; out: number; low: number; minStock: number; which: string[] }>();
  for (const r of lowRows) {
    const e = byProduct.get(r.id) ?? { id: r.id, name: r.name, out: 0, low: 0, minStock: r.stock, which: [] };
    if (r.stock === 0) e.out++; else e.low++;
    e.minStock = Math.min(e.minStock, r.stock);
    e.which.push([r.option2 !== "Default" && r.option2, r.option1 !== "Free size" && r.option1].filter(Boolean).join(" ") || "all");
    byProduct.set(r.id, e);
  }
  const lowStock = [...byProduct.values()].sort((a, b) => b.out - a.out || a.minStock - b.minStock).slice(0, 8)
    .map((e) => ({ ...e, which: e.which.length > 4 ? `${e.which.slice(0, 4).join(", ")} +${e.which.length - 4} more` : e.which.join(", ") }));

  return {
    buckets, sources: [...sources].map(([name, s]) => ({ name, ...s })).sort((a, b) => b.revenue - a.revenue),
    today: t, week, month, aov: month.orders ? Math.round(month.revenue / month.orders) : 0,
    toShip: Number(toShip.n), inTransit: Number(inTransit.n), returns: Number(returns.n), refundDue: Number(refundDue.n),
    abandoned: { n: Number(abandoned.n), value: Number(abandoned.v) }, top, lowStock,
  };
}
