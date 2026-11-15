import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { PageHead, Panel } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Visitors" };
const RANGES = [{ d: 1, label: "Today" }, { d: 7, label: "7 days" }, { d: 30, label: "30 days" }, { d: 90, label: "90 days" }];
const pv = schema.pageViews, ev = schema.siteEvents;
const time = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${Math.round(ms / 1000)}s`);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function Bars({ rows, unit = "" }: { rows: { label: string; n: number; sub?: string }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <p className="text-sm text-ink-soft">Nothing yet.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="relative overflow-hidden rounded-sm bg-ivory px-2.5 py-1.5 text-sm">
          <span className="absolute inset-y-0 left-0 bg-sand" style={{ width: `${(r.n / max) * 100}%` }} aria-hidden />
          <span className="relative flex justify-between gap-3"><span className="min-w-0 truncate">{r.label}{r.sub && <span className="text-ink-soft"> · {r.sub}</span>}</span><b className="shrink-0 tabular-nums">{r.n}{unit}</b></span>
        </li>
      ))}
    </ul>
  );
}

export default async function Analytics({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const q = (await searchParams).d;
  const d = RANGES.find((r) => String(r.d) === q)?.d ?? 7;
  const since = d === 1 ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : Date.now() - d * 86_400_000;
  const inRange = gte(pv.createdAt, since), evRange = gte(ev.createdAt, since);
  const [[tot], [live], pages, prodViews, prodAdds, clicks, searches, sources, devices, cities, days, funnelRows] = await Promise.all([
    db.select({ visitors: sql<number>`count(distinct ${pv.sessionId})`, views: sql<number>`count(*)`, avg: sql<number>`coalesce(avg(nullif(${pv.durationMs}, 0)), 0)` }).from(pv).where(inRange),
    db.select({ n: sql<number>`count(distinct ${pv.sessionId})` }).from(pv).where(gte(pv.createdAt, Date.now() - 5 * 60_000)),
    db.select({ path: pv.path, n: sql<number>`count(*)`, avg: sql<number>`coalesce(avg(nullif(${pv.durationMs}, 0)), 0)`, scroll: sql<number>`avg(${pv.scrollPct})` }).from(pv).where(inRange).groupBy(pv.path).orderBy(desc(sql`count(*)`)).limit(15),
    db.select({ id: pv.productId, n: sql<number>`count(*)`, avg: sql<number>`coalesce(avg(nullif(${pv.durationMs}, 0)), 0)` }).from(pv).where(and(inRange, sql`${pv.productId} is not null`)).groupBy(pv.productId).orderBy(desc(sql`count(*)`)).limit(15),
    db.select({ id: ev.productId, n: sql<number>`count(*)` }).from(ev).where(and(evRange, sql`${ev.type} = 'add_to_cart'`)).groupBy(ev.productId),
    db.select({ label: ev.label, n: sql<number>`count(*)` }).from(ev).where(and(evRange, sql`${ev.type} = 'click'`)).groupBy(ev.label).orderBy(desc(sql`count(*)`)).limit(20),
    db.select({ label: ev.label, n: sql<number>`count(*)` }).from(ev).where(and(evRange, sql`${ev.type} = 'search'`)).groupBy(sql`lower(${ev.label})`).orderBy(desc(sql`count(*)`)).limit(15),
    db.select({ label: sql<string>`coalesce(${pv.source}, 'direct')`, n: sql<number>`count(distinct ${pv.sessionId})` }).from(pv).where(and(inRange, sql`${pv.source} is not null`)).groupBy(pv.source).orderBy(desc(sql`count(distinct ${pv.sessionId})`)).limit(10),
    db.select({ label: sql<string>`coalesce(${pv.device}, 'unknown')`, n: sql<number>`count(distinct ${pv.sessionId})` }).from(pv).where(inRange).groupBy(pv.device),
    db.select({ label: sql<string>`coalesce(${pv.city}, 'unknown')`, n: sql<number>`count(distinct ${pv.sessionId})` }).from(pv).where(inRange).groupBy(pv.city).orderBy(desc(sql`count(distinct ${pv.sessionId})`)).limit(10),
    db.select({ day: sql<string>`strftime('%d %b', ${pv.createdAt} / 1000, 'unixepoch', '+05:30')`, n: sql<number>`count(distinct ${pv.sessionId})`, v: sql<number>`count(*)` }).from(pv).where(inRange).groupBy(sql`1`).orderBy(sql`min(${pv.createdAt})`),
    db.select({ type: ev.type, n: sql<number>`count(distinct ${ev.sessionId})` }).from(ev).where(and(evRange, inArray(ev.type, ["add_to_cart", "checkout_start", "purchase"]))).groupBy(ev.type),
  ]);
  const [{ viewed }] = await db.select({ viewed: sql<number>`count(distinct ${pv.sessionId})` }).from(pv).where(and(inRange, sql`${pv.productId} is not null`));
  const ids = [...new Set([...prodViews.map((r) => r.id), ...prodAdds.map((r) => r.id)].filter(Boolean))] as string[];
  const names = ids.length ? await db.select({ id: schema.products.id, name: schema.products.name }).from(schema.products).where(inArray(schema.products.id, ids)) : [];
  const nameOf = (id: string | null) => names.find((n) => n.id === id)?.name ?? "Removed listing";
  const step = (t: string) => Number(funnelRows.find((f) => f.type === t)?.n ?? 0);
  const funnel = [
    { label: "Visited the store", n: Number(tot.visitors) },
    { label: "Looked at a product", n: Number(viewed) },
    { label: "Added to cart", n: step("add_to_cart") },
    { label: "Started checkout", n: step("checkout_start") },
    { label: "Placed an order", n: step("purchase") },
  ];
  return (
    <>
      <PageHead title="Visitors" sub="Who visits, what they look at, and where they drop off. No personal data is collected." actions={
        <nav className="flex gap-1" aria-label="Date range">{RANGES.map((r) => <Link key={r.d} href={`/admin/analytics?d=${r.d}`} aria-current={r.d === d ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${r.d === d ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{r.label}</Link>)}</nav>
      } />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="analytics-totals">
        {[["Visitors", Number(tot.visitors)], ["Page views", Number(tot.views)], ["Avg time on a page", time(Number(tot.avg))], ["On the site now", Number(live.n)]].map(([k, v]) => (
          <div key={k} className="rounded-sm border border-line bg-white p-4"><p className="text-xs font-semibold text-ink-soft">{k}</p><p className="mt-1 font-display text-4xl tabular-nums">{v}</p></div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
        <Panel title="From visit to order">
          <ol className="space-y-2">
            {funnel.map((f, i) => (
              <li key={f.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
                <span className="relative overflow-hidden rounded-sm bg-ivory px-2.5 py-1.5"><span className="absolute inset-y-0 left-0 bg-pine-soft" style={{ width: pct(f.n, funnel[0].n) === "—" ? "0%" : pct(f.n, funnel[0].n) }} aria-hidden /><span className="relative">{f.label}</span></span>
                <b className="tabular-nums">{f.n}</b><span className="w-12 text-right text-xs text-ink-soft">{i ? pct(f.n, funnel[i - 1].n) : ""}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-ink-soft">The % is how many moved on from the step above.</p>
        </Panel>
        <Panel title="Visitors by day"><Bars rows={days.map((x) => ({ label: x.day, n: Number(x.n), sub: `${x.v} views` }))} /></Panel>
        <Panel title="Most viewed products">
          <Bars rows={prodViews.map((r) => ({ label: nameOf(r.id), n: Number(r.n), sub: `${prodAdds.find((a) => a.id === r.id)?.n ?? 0} added to cart · ${time(Number(r.avg))} avg` }))} />
        </Panel>
        <Panel title="Pages and time spent">
          <Bars rows={pages.map((r) => ({ label: r.path, n: Number(r.n), sub: `${time(Number(r.avg))} avg · ${Math.round(Number(r.scroll))}% scrolled` }))} />
        </Panel>
        <Panel title="What people click"><Bars rows={clicks.map((r) => ({ label: r.label ?? "—", n: Number(r.n) }))} /></Panel>
        <Panel title="What people search for"><Bars rows={searches.map((r) => ({ label: r.label ?? "—", n: Number(r.n) }))} /></Panel>
        <Panel title="Where visitors come from"><Bars rows={sources.map((r) => ({ label: r.label, n: Number(r.n) }))} /></Panel>
        <Panel title="Devices and places">
          <Bars rows={devices.map((r) => ({ label: r.label, n: Number(r.n) }))} />
          <div className="mt-4"><Bars rows={cities.map((r) => ({ label: r.label, n: Number(r.n) }))} /></div>
        </Panel>
      </div>
      <p className="mt-4 text-xs text-ink-soft">Counts visitors in their browser with an anonymous id. Your own visits while logged in to admin aren&apos;t counted. Data older than 90 days is deleted.</p>
    </>
  );
}
