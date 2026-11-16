import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { Empty, PageHead } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/format";
import { changeCount, describeChanges, type Change } from "@/lib/audit-diff";

export const metadata: Metadata = { title: "Change history" };
const TYPES: [string, string][] = [["product", "Listings"], ["order", "Orders"], ["inventory", "Stock"], ["settings", "Settings"], ["sale", "Sales"], ["cart_offer", "Offers"], ["coupon", "Coupons"], ["category", "Categories"], ["review", "Reviews"], ["customer", "Customers"], ["admin", "Logins"]];
const WHEN: [string, string, number][] = [["today", "Today", 1], ["week", "Last 7 days", 7], ["month", "Last 30 days", 30], ["all", "Everything", 0]];
const LINK: Record<string, (id: string) => string> = { product: (id) => `/admin/products/${id}`, order: (id) => `/admin/orders/${id}` };
const IST = 5.5 * 3600_000;

function Row({ c }: { c: Change }) {
  const tone = c.kind === "add" ? "text-pine" : c.kind === "remove" ? "text-clay" : "";
  return (
    <li className="flex flex-wrap gap-x-1.5">
      <span className={`font-medium ${tone}`}>{c.label}</span>
      {c.note && <span className={`text-ink-soft ${tone}`}>{c.note}</span>}
      {c.from != null && <span><s className="text-clay decoration-clay/60">{c.from}</s> <span aria-hidden>→</span><span className="sr-only">changed to</span> <b className="text-pine">{c.to}</b></span>}
      {c.from == null && c.to != null && <b className="text-pine">{c.to}</b>}
    </li>
  );
}

export default async function Audit({ searchParams }: { searchParams: Promise<{ entity?: string; when?: string; id?: string }> }) {
  const sp = await searchParams;
  const a = schema.auditLogs;
  const when = WHEN.find((w) => w[0] === sp.when) ?? WHEN[1];
  const conds: SQL[] = [];
  if (sp.entity) conds.push(eq(a.entity, sp.entity));
  if (sp.id) conds.push(eq(a.entityId, sp.id));
  if (when[2]) { const now = Date.now(); conds.push(gte(a.createdAt, Math.floor((now + IST) / 86_400_000) * 86_400_000 - IST - (when[2] - 1) * 86_400_000)); }
  const rows = await db.select().from(a).where(conds.length ? and(...conds) : undefined).orderBy(desc(a.createdAt)).limit(200);
  const q = (patch: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ entity: sp.entity, when: sp.when, id: sp.id, ...patch }).filter(([, v]) => v) as [string, string][])}`;
  const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${on ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`;
  return (
    <>
      <PageHead title="Change history" sub="Every change made in admin, who made it, and exactly what changed. Entries can't be edited or deleted." />
      <nav aria-label="Show changes from" className="scrollbar-none mb-2 flex gap-1.5 overflow-x-auto">
        {WHEN.map(([k, label]) => <Link key={k} href={q({ when: k })} className={chip(when[0] === k)}>{label}</Link>)}
      </nav>
      <nav aria-label="Type of change" className="scrollbar-none mb-4 flex gap-1.5 overflow-x-auto">
        <Link href={q({ entity: undefined, id: undefined })} className={chip(!sp.entity)}>All</Link>
        {TYPES.map(([k, label]) => <Link key={k} href={q({ entity: k, id: undefined })} className={chip(sp.entity === k)}>{label}</Link>)}
      </nav>
      {sp.id && <p className="mb-3 text-sm">Showing one item only. <Link href={q({ id: undefined })} className="underline">Show all</Link></p>}
      {rows.length ? (
        <ol className="space-y-2" data-testid="audit-list">
          {rows.map((r) => {
            const groups = r.action === "login" ? [] : describeChanges(r.entity, r.before, r.after);
            const n = changeCount(groups);
            const big = n > 8;
            const body = groups.map((g) => (
              <div key={g.title} className="mt-2">
                <p className="text-[11px] font-bold tracking-[0.08em] text-ink-soft uppercase">{g.title}</p>
                <ul className="mt-0.5 space-y-0.5 text-sm">{g.changes.slice(0, 60).map((c, i) => <Row key={i} c={c} />)}{g.changes.length > 60 && <li className="text-ink-soft">…and {g.changes.length - 60} more</li>}</ul>
              </div>
            ));
            return (
              <li key={r.id} className="rounded-sm border border-line bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-medium">{r.summary}{r.entityId && LINK[r.entity] && <> · <Link href={LINK[r.entity](r.entityId)} className="text-sm underline">open</Link> · <Link href={q({ entity: r.entity, id: r.entityId })} className="text-sm underline">history</Link></>}</p>
                  <p className="text-xs whitespace-nowrap text-ink-soft">{formatDateTime(r.createdAt)} · {r.actorName}</p>
                </div>
                {n > 0 && (big
                  ? <details className="mt-1"><summary className="cursor-pointer text-sm font-medium text-ink-soft">{n} changes: {groups.map((g) => g.title.replace(/ \(\d+\)$/, "")).join(", ")}</summary>{body}</details>
                  : body)}
              </li>
            );
          })}
        </ol>
      ) : <Empty>No changes in this period.</Empty>}
    </>
  );
}
