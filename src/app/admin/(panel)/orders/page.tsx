import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";
import { db, schema } from "@/db";
import { OrdersTable } from "@/components/admin/orders-table";
import { Empty, PageHead } from "@/components/admin/ui";
import { PickupRequest } from "@/components/admin/pickup-request";
import { delhiveryConfigured } from "@/lib/delhivery";
import { nextStep } from "@/lib/next-step";

export const metadata: Metadata = { title: "Orders" };
const TABS = [
  { key: "all", label: "All" }, { key: "to_ship", label: "To ship" }, { key: "in_transit", label: "In transit" }, { key: "delivered", label: "Delivered" },
  { key: "return_requested", label: "Returns" }, { key: "refund_due", label: "Refund due" }, { key: "cancelled", label: "Cancelled" }, { key: "pending_payment", label: "Unpaid" },
];
const o = schema.orders;

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const conds: SQL[] = [];
  if (status === "to_ship") conds.push(inArray(o.status, ["confirmed", "packed"]));
  else if (status === "in_transit") conds.push(inArray(o.status, ["shipped", "out_for_delivery"]));
  else if (status === "refund_due") conds.push(and(eq(o.status, "cancelled"), eq(o.paymentStatus, "paid"))!);
  else if (status === "all") conds.push(sql`${o.status} != 'pending_payment'`);
  else conds.push(eq(o.status, status as typeof o.$inferSelect.status));
  const q = sp.q?.trim();
  if (q) { const t = `%${q}%`; conds.push(or(like(o.number, t), like(o.name, t), like(o.phone, t), like(o.email, t), like(o.awb, t))!); }
  if (sp.from) conds.push(gte(o.createdAt, new Date(sp.from).getTime()));
  if (sp.to) conds.push(lte(o.createdAt, new Date(sp.to).getTime() + 86_400_000));
  if (sp.source) conds.push(eq(o.utmSource, sp.source));
  const rows = await db.select().from(o).where(and(...conds)).orderBy(desc(o.createdAt)).limit(200);
  const items = rows.length
    ? await db.select({ orderId: schema.orderItems.orderId, qty: sql<number>`sum(${schema.orderItems.qty})` }).from(schema.orderItems).where(inArray(schema.orderItems.orderId, rows.map((r) => r.id))).groupBy(schema.orderItems.orderId)
    : [];
  const rets = rows.length ? await db.select({ orderId: schema.returnRequests.orderId, status: schema.returnRequests.status, createdAt: schema.returnRequests.createdAt }).from(schema.returnRequests).where(inArray(schema.returnRequests.orderId, rows.map((r) => r.id))) : [];
  const exportQ = new URLSearchParams({ ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) }).toString();
  return (
    <>
      <PageHead title="Orders" sub={`${rows.length} shown`} actions={<a className="btn btn-white btn-sm" href={`/api/admin/orders/export?${exportQ}`}><Download size={15} aria-hidden /> Export CSV</a>} />
      {delhiveryConfigured() && <PickupRequest waiting={(await db.select({ n: sql<number>`count(*)` }).from(o).where(and(eq(o.courier, "Delhivery"), inArray(o.status, ["confirmed", "packed"]))))[0].n} />}
      <nav aria-label="Filter by status" className="scrollbar-none mb-3 flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => <Link key={t.key} href={`/admin/orders?status=${t.key}`} aria-current={status === t.key ? "page" : undefined} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${status === t.key ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{t.label}</Link>)}
      </nav>
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="status" value={status} />
        <input aria-label="Search orders" name="q" defaultValue={q} className="input min-w-48 flex-1 py-1.5" placeholder="Order no, name, phone, email, AWB" />
        <label className="flex items-center gap-1 text-xs font-medium">From <input type="date" name="from" defaultValue={sp.from} className="input w-auto py-1.5" /></label>
        <label className="flex items-center gap-1 text-xs font-medium">To <input type="date" name="to" defaultValue={sp.to} className="input w-auto py-1.5" /></label>
        <button className="btn btn-ink btn-sm">Search</button>
      </form>
      {rows.length ? (
        <OrdersTable rows={rows.map((r) => ({ id: r.id, number: r.number, name: r.name, phone: r.phone, status: r.status, paymentStatus: r.paymentStatus, paymentMethod: r.paymentMethod, total: r.total, createdAt: r.createdAt, awb: r.awb, source: r.utmSource, qty: Number(items.find((i) => i.orderId === r.id)?.qty ?? 0),
          next: nextStep(r, rets.filter((x) => x.orderId === r.id).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null) }))} delhivery={delhiveryConfigured()} />
      ) : <Empty>No orders match.</Empty>}
    </>
  );
}
