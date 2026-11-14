import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { ResendButton } from "@/components/admin/misc-actions";
import { Empty, PageHead, Tbl } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/format";
import { emailConfigured, whatsappConfigured } from "@/lib/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default async function Notifications({ searchParams }: { searchParams: Promise<{ status?: string; channel?: string }> }) {
  const sp = await searchParams;
  const n = schema.notifications;
  const conds: SQL[] = [];
  if (sp.status) conds.push(eq(n.status, sp.status as "sent"));
  if (sp.channel) conds.push(eq(n.channel, sp.channel as "email"));
  // Login codes are stored for delivery status, and are never shown here.
  const rows = await db.select({ id: n.id, orderId: n.orderId, event: n.event, channel: n.channel, recipient: n.recipient, status: n.status, error: n.error, attempts: n.attempts, createdAt: n.createdAt, number: schema.orders.number })
    .from(n).leftJoin(schema.orders, eq(schema.orders.id, n.orderId)).where(conds.length ? and(...conds) : undefined).orderBy(desc(n.createdAt)).limit(300);
  return (
    <>
      <PageHead title="Notifications" sub="Every email and WhatsApp message, and whether it went through." />
      {(!emailConfigured() || !whatsappConfigured()) && (
        <p className="mb-4 rounded-sm border border-sand bg-sand-soft/50 p-3 text-sm">
          {!emailConfigured() && <><b>Email isn&apos;t connected.</b> </>}{!whatsappConfigured() && <><b>WhatsApp isn&apos;t connected.</b> </>}
          Messages are logged as “not connected” and not sent. Until then, use the <b>Send on WhatsApp</b> buttons on each order.
        </p>
      )}
      <form className="mb-4 flex flex-wrap gap-2">
        <select aria-label="Status" name="status" defaultValue={sp.status} className="input w-auto py-1.5"><option value="">All statuses</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="not_configured">Not connected</option></select>
        <select aria-label="Channel" name="channel" defaultValue={sp.channel} className="input w-auto py-1.5"><option value="">All channels</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select>
        <button className="btn btn-ink btn-sm">Filter</button>
      </form>
      {rows.length ? (
        <Tbl>
          <thead><tr><th>When</th><th>Channel</th><th>Event</th><th>To</th><th>Order</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className="text-xs whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
              <td className="capitalize">{r.channel}</td><td className="capitalize">{r.event.replace(/_/g, " ")}</td><td className="text-xs">{r.recipient}</td>
              <td>{r.orderId ? <Link className="font-mono text-xs underline" href={`/admin/orders/${r.orderId}`}>{r.number}</Link> : "—"}</td>
              <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${r.status === "sent" ? "bg-pine-soft" : r.status === "failed" ? "bg-clay-soft" : "bg-line"}`}>{r.status === "not_configured" ? "Not connected" : r.status}</span>{r.error && <span className="block max-w-56 text-xs text-clay">{r.error}</span>}</td>
              <td>{r.status !== "sent" && r.event !== "login_otp" && <ResendButton id={r.id} />}</td>
            </tr>
          ))}</tbody>
        </Tbl>
      ) : <Empty>No messages yet.</Empty>}
    </>
  );
}
