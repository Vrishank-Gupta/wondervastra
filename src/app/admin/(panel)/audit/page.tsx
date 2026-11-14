import type { Metadata } from "next";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { Empty, PageHead, Tbl } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };
const ENTITIES = ["order", "product", "category", "inventory", "sale", "coupon", "cart_offer", "review", "customer", "settings", "admin", "orders", "notification"];

function changed(before: unknown, after: unknown) {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [];
  const b = before as Record<string, unknown>, a = after as Record<string, unknown>;
  return Object.keys(a).filter((k) => k !== "variants" && k !== "images" && k in b && JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => ({ k, from: b[k], to: a[k] }));
}

export default async function Audit({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const sp = await searchParams;
  const a = schema.auditLogs;
  const conds: SQL[] = [];
  if (sp.entity) conds.push(eq(a.entity, sp.entity));
  const rows = await db.select().from(a).where(conds.length ? and(...conds) : undefined).orderBy(desc(a.createdAt)).limit(300);
  return (
    <>
      <PageHead title="Audit log" sub="Who did what, and when. Entries can't be edited or deleted from here." />
      <form className="mb-4 flex gap-2">
        <select aria-label="Filter by type" name="entity" defaultValue={sp.entity} className="input w-auto py-1.5"><option value="">Everything</option>{ENTITIES.map((e) => <option key={e} value={e}>{e.replace("_", " ")}</option>)}</select>
        <button className="btn btn-ink btn-sm">Filter</button>
      </form>
      {rows.length ? (
        <Tbl>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>What changed</th><th>IP</th></tr></thead>
          <tbody>{rows.map((r) => {
            const diff = changed(r.before, r.after);
            return (
              <tr key={r.id} className="align-top">
                <td className="text-xs whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                <td className="font-medium whitespace-nowrap">{r.actorName}</td>
                <td className="text-xs capitalize">{r.action} {r.entity.replace("_", " ")}</td>
                <td className="min-w-64">{r.summary}
                  {diff.length > 0 && <details className="mt-1 text-xs"><summary className="cursor-pointer font-medium text-ink-soft">{diff.length} field{diff.length > 1 ? "s" : ""} changed</summary><ul className="mt-1 space-y-0.5">{diff.slice(0, 20).map((d) => <li key={d.k}><b>{d.k}</b>: <span className="text-clay">{JSON.stringify(d.from)}</span> → <span className="text-pine">{JSON.stringify(d.to)}</span></li>)}</ul></details>}
                </td>
                <td className="text-xs text-ink-soft">{r.ip ?? "—"}</td>
              </tr>
            );
          })}</tbody>
        </Tbl>
      ) : <Empty>Nothing logged yet.</Empty>}
    </>
  );
}
