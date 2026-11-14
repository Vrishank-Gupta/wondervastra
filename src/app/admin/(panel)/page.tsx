import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Circle, CreditCard, PackageOpen, RotateCcw, Truck } from "lucide-react";
import { db, schema } from "@/db";
import { RankBars, RevenueChart } from "@/components/admin/charts";
import { Empty, PageHead, Panel, PayBadge, StatusBadge } from "@/components/admin/ui";
import { dashboardStats } from "@/lib/admin-stats";
import { formatDateTime, money } from "@/lib/format";
import { emailConfigured, whatsappConfigured } from "@/lib/notifications";
import { razorpayConfigured } from "@/lib/razorpay";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-sm border border-line bg-white p-4">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="font-display mt-0.5 text-2xl sm:text-3xl">{value}</p>
      {sub && <p className="text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}

export default async function Dashboard() {
  const [s, settings, recent, sample] = await Promise.all([
    dashboardStats(), getSettings(),
    db.select().from(schema.orders).where(sql`${schema.orders.status} != 'pending_payment'`).orderBy(desc(schema.orders.createdAt)).limit(8),
    db.select({ n: sql<number>`count(*)` }).from(schema.productImages).where(sql`${schema.productImages.url} LIKE '/seed/%'`),
  ]);
  const [{ n: productCount }] = await db.select({ n: sql<number>`count(*)` }).from(schema.products).where(eq(schema.products.status, "active"));

  const checklist = [
    { done: razorpayConfigured(), label: "Connect Razorpay to accept real payments", href: "/admin/settings" },
    { done: emailConfigured(), label: "Connect email (Resend) for order updates", href: "/admin/settings" },
    { done: whatsappConfigured(), label: "Connect WhatsApp Cloud API (or use one-tap send on each order)", href: "/admin/settings" },
    { done: Boolean(settings.legalName && settings.businessAddress), label: "Add your legal business name and address", href: "/admin/settings" },
    { done: Boolean(settings.supportEmail && settings.whatsappNumber), label: "Add support email and WhatsApp number", href: "/admin/settings" },
    { done: Number(sample[0].n) === 0, label: `Replace stand-in stock photos with your own product photos (${sample[0].n} left)`, href: "/admin/products" },
  ];
  const pending = checklist.filter((c) => !c.done);

  const actions = [
    { n: s.toShip, label: "to pack & ship", icon: PackageOpen, href: "/admin/orders?status=to_ship" },
    { n: s.inTransit, label: "in transit", icon: Truck, href: "/admin/orders?status=in_transit" },
    { n: s.returns, label: "return requests", icon: RotateCcw, href: "/admin/orders?status=return_requested" },
    { n: s.refundDue, label: "refunds due", icon: CreditCard, href: "/admin/orders?status=refund_due" },
  ];

  return (
    <>
      <PageHead title="Dashboard" sub={`${productCount} live listings`} actions={<Link className="btn btn-primary btn-sm" href="/admin/products/new">Add listing</Link>} />
      {pending.length > 0 && (
        <Panel title="Before you launch" className="mb-5 border border-sand bg-sand-soft/40">
          <ul className="grid gap-1.5 text-sm md:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-start gap-2">
                {c.done ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-pine" aria-label="Done" /> : <Circle size={17} className="mt-0.5 shrink-0 text-ink-soft" aria-label="To do" />}
                {c.done ? <span className="text-ink-soft line-through">{c.label}</span> : <Link href={c.href} className="underline underline-offset-2">{c.label}</Link>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales today" value={money(s.today.revenue)} sub={`${s.today.orders} ${s.today.orders === 1 ? "order" : "orders"}`} />
        <Stat label="Last 7 days" value={money(s.week.revenue)} sub={`${s.week.orders} orders`} />
        <Stat label="Last 30 days" value={money(s.month.revenue)} sub={`${s.month.orders} orders`} />
        <Stat label="Average order value" value={money(s.aov)} sub="Last 30 days" />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {actions.map((a) => (
          <Link key={a.label} href={a.href} className={`flex items-center gap-3 rounded-sm border p-3 hover:border-ink ${a.n ? "border-ink bg-white" : "border-line bg-white/60"}`}>
            <a.icon size={20} aria-hidden /><span><b className="block text-xl leading-none">{a.n}</b><span className="text-xs text-ink-soft">{a.label}</span></span>
          </Link>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Panel title="Net sales, last 30 days"><RevenueChart data={s.buckets} /></Panel>
          <Panel title="Latest orders" actions={<Link href="/admin/orders" className="text-sm font-medium underline">All orders</Link>}>
            {recent.length ? (
              <ul className="divide-y divide-ink/10 text-sm">
                {recent.map((o) => (
                  <li key={o.id}><Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-ivory">
                    <b className="w-24 font-mono text-xs">{o.number}</b><span className="min-w-24 flex-1 truncate">{o.name}</span><StatusBadge status={o.status} /><PayBadge status={o.paymentStatus} method={o.paymentMethod} /><b className="w-16 text-right">{money(o.total)}</b><span className="hidden w-36 text-right text-xs text-ink-soft sm:block">{formatDateTime(o.createdAt)}</span>
                  </Link></li>
                ))}
              </ul>
            ) : <Empty>No orders yet. Share a listing link on Instagram to get the first one.</Empty>}
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel title="Sales by source">
            {s.sources.length ? <RankBars titleCase rows={s.sources.map((x) => ({ name: x.name, value: x.revenue, sub: `${x.orders} ${x.orders === 1 ? "order" : "orders"}` }))} /> : <p className="text-sm text-ink-soft">Shows whether Instagram, WhatsApp or direct visits bring in sales.</p>}
          </Panel>
          <Panel title="Top sellers">
            {s.top.length ? <RankBars rows={s.top.map((x) => ({ name: x.name, value: Number(x.revenue), sub: `${x.qty} ${Number(x.qty) === 1 ? "pc" : "pcs"}` }))} /> : <p className="text-sm text-ink-soft">Appears after your first orders.</p>}
          </Panel>
          <Panel title="Low stock" actions={<Link href="/admin/inventory" className="text-sm font-medium underline">Inventory</Link>}>
            {s.lowStock.length ? (
              <ul className="space-y-1.5 text-sm">
                {s.lowStock.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2"><span className="min-w-0 truncate"><Link href={`/admin/products/${l.id}`} className="hover:underline">{l.name}</Link> <span className="text-xs text-ink-soft">{l.option2} {l.option1}</span></span>
                    <b className={`flex shrink-0 items-center gap-1 ${l.stock === 0 ? "text-clay" : ""}`}>{l.stock === 0 && <AlertTriangle size={13} aria-hidden />}{l.stock}</b></li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-soft">All listings are well stocked.</p>}
          </Panel>
          {s.abandoned.n > 0 && (
            <Panel title="Unfinished payments">
              <p className="text-sm"><b>{s.abandoned.n}</b> checkouts worth <b>{money(s.abandoned.value)}</b> weren&apos;t paid in the last 30 days.</p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
