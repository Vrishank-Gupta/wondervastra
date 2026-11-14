import type { Metadata } from "next";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { AdminNav } from "@/components/admin/nav";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Seller admin", template: "%s | Seller admin" }, robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const count = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  const n = sql<number>`count(*)`;
  const [orders, reviews, notifs, stock] = await Promise.all([
    count(db.select({ n }).from(schema.orders).where(sql`${schema.orders.status} IN ('confirmed','packed','return_requested')`)),
    count(db.select({ n }).from(schema.reviews).where(eq(schema.reviews.status, "pending"))),
    count(db.select({ n }).from(schema.notifications).where(eq(schema.notifications.status, "failed"))),
    count(db.select({ n }).from(schema.stockAlerts).where(eq(schema.stockAlerts.status, "waiting"))),
  ]);
  return (
    <div className="min-h-dvh bg-ivory">
      <AdminNav name={admin.name} badges={{ orders, reviews, notifs, stock }} />
      <main className="p-4 lg:ml-60 lg:p-7 print:ml-0 print:p-0">{children}</main>
    </div>
  );
}
