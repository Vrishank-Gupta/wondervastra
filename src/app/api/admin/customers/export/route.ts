import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const a = await getAdmin();
  if (!a) return new Response("Unauthorized", { status: 401 });
  if (a.role !== "owner") return new Response("Only the store owner can export customer data.", { status: 403 });
  const o = schema.orders;
  const rows = await db.select({
    name: sql<string>`max(${o.name})`, phone: o.phone, email: sql<string>`max(${o.email})`, orders: sql<number>`count(*)`,
    spent: sql<number>`sum(case when ${o.status} != 'cancelled' then ${o.total} - ${o.refundedTotal} else 0 end)`, last: sql<number>`max(${o.createdAt})`,
  }).from(o).where(sql`${o.status} != 'pending_payment'`).groupBy(o.phone).orderBy(desc(sql`max(${o.createdAt})`));
  await audit(a, "export", "customers", null, `Exported ${rows.length} customers to CSV`);
  const out = [["Name", "Phone", "Email", "Orders", "Net spend (INR)", "Last order"], ...rows.map((r) => [r.name, r.phone, r.email, r.orders, (Number(r.spent) / 100).toFixed(2), new Date(Number(r.last)).toISOString()])];
  return new Response(toCsv(out), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="wondervastra-customers.csv"' } });
}
