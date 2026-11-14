import type { Metadata } from "next";
import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { Download } from "lucide-react";
import { db, schema } from "@/db";
import { CustomerBlock } from "@/components/admin/misc-actions";
import { Empty, PageHead, Tbl } from "@/components/admin/ui";
import { formatDate, money } from "@/lib/format";

export const metadata: Metadata = { title: "Customers" };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const o = schema.orders;
  const filter = q ? sql`AND (lower(${o.name}) LIKE ${`%${q.toLowerCase()}%`} OR ${o.phone} LIKE ${`%${q}%`} OR ${o.email} LIKE ${`%${q.toLowerCase()}%`})` : sql``;
  const rows = await db.select({
    phone: o.phone, name: sql<string>`max(${o.name})`, email: sql<string>`max(${o.email})`, city: sql<string>`max(${o.city})`, orders: sql<number>`count(*)`,
    spent: sql<number>`sum(case when ${o.status} != 'cancelled' then ${o.total} - ${o.refundedTotal} else 0 end)`, last: sql<number>`max(${o.createdAt})`,
  }).from(o).where(sql`${o.status} != 'pending_payment' ${filter}`).groupBy(o.phone).orderBy(desc(sql`max(${o.createdAt})`)).limit(300);
  const accounts = await db.select().from(schema.customers).limit(2000);
  return (
    <>
      <PageHead title="Customers" sub={`${rows.length} buyers`} actions={<a className="btn btn-white btn-sm" href="/api/admin/customers/export"><Download size={15} aria-hidden /> Export CSV</a>} />
      <form className="mb-4 flex gap-2"><input aria-label="Search customers" name="q" defaultValue={q} className="input py-1.5" placeholder="Name, phone or email" /><button className="btn btn-ink btn-sm">Search</button></form>
      {rows.length ? (
        <Tbl>
          <thead><tr><th>Customer</th><th>City</th><th className="text-right">Orders</th><th className="text-right">Net spend</th><th>Last order</th><th>Account</th></tr></thead>
          <tbody>{rows.map((r) => {
            const acc = accounts.find((a) => a.phone === r.phone || a.email === r.email);
            return (
              <tr key={r.phone} className="hover:bg-ivory">
                <td><Link className="font-medium hover:underline" href={`/admin/orders?q=${r.phone}`}>{r.name}</Link><span className="block text-xs text-ink-soft">{r.phone} · {r.email}</span></td>
                <td>{r.city}</td><td className="text-right font-medium">{r.orders}{Number(r.orders) > 1 && <span className="ml-1 rounded bg-pine-soft px-1 text-[10px]">repeat</span>}</td>
                <td className="text-right font-medium">{money(Number(r.spent))}</td><td className="text-xs whitespace-nowrap">{formatDate(Number(r.last))}</td>
                <td>{acc ? <CustomerBlock id={acc.id} blocked={acc.blocked} /> : <span className="text-xs text-ink-soft">Guest</span>}</td>
              </tr>
            );
          })}</tbody>
        </Tbl>
      ) : <Empty>Buyers appear here after their first order.</Empty>}
    </>
  );
}
