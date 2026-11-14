import type { Metadata } from "next";
import { asc, desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { SettingsForm } from "@/components/admin/settings-form";
import { StaffToggle } from "@/components/admin/misc-actions";
import { PageHead, Panel } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { emailConfigured, whatsappConfigured } from "@/lib/notifications";
import { razorpayConfigured } from "@/lib/razorpay";
import { getSettingsFresh } from "@/lib/settings";
import { siteUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

export default async function Settings() {
  const ar = schema.areaRequests;
  const [me, s, team, top, recent, [{ total }]] = await Promise.all([
    requireAdmin(), getSettingsFresh(), db.select().from(schema.admins).orderBy(asc(schema.admins.createdAt)),
    db.select({ pincode: ar.pincode, place: sql<string | null>`max(${ar.place})`, n: sql<number>`count(*)` }).from(ar).groupBy(ar.pincode).orderBy(desc(sql`count(*)`)).limit(8),
    db.select().from(ar).orderBy(desc(ar.createdAt)).limit(30),
    db.select({ total: sql<number>`count(*)` }).from(ar),
  ]);
  const demand = { total: Number(total), top: top.map((t) => ({ ...t, n: Number(t.n) })), recent: recent.map((r) => ({ pincode: r.pincode, contact: r.email ?? r.phone ?? "", at: r.createdAt })) };
  const conn = [
    { name: "Online payments (UPI, cards)", on: razorpayConfigured(), what: "Customers can pay online through Razorpay.", off: "Until this is on, customers can only pay cash on delivery. Needs your Razorpay account to be approved.", keys: "RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET" },
    { name: "Order emails", on: emailConfigured(), what: "Customers get emails when they order and when it ships.", off: "Customers won't get order emails yet.", keys: "RESEND_API_KEY, EMAIL_FROM" },
    { name: "Automatic WhatsApp messages", on: whatsappConfigured(), what: "Order updates go out on WhatsApp by themselves.", off: "You can still send each update with one tap from the order page.", keys: "WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID" },
  ];
  return (
    <>
      <PageHead title="Settings" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="xl:col-span-2"><SettingsForm initial={s} isOwner={me.role === "owner"} demand={demand} /></div>
        <div className="space-y-5">
          <Panel title="Services">
            <ul className="space-y-3 text-sm">
              {conn.map((c) => (
                <li key={c.name}><span className="flex items-center justify-between gap-2 font-medium">{c.name}<span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${c.on ? "bg-pine-soft" : "bg-line"}`}>{c.on ? "On" : "Not set up"}</span></span>
                  <span className="block text-xs text-ink-soft">{c.on ? c.what : c.off}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-soft">Setting these up needs your developer.</p>
            <details className="mt-2 text-xs text-ink-soft"><summary className="cursor-pointer">Details for your developer</summary>
              <ul className="mt-1 space-y-1 break-words">{conn.filter((c) => !c.on).map((c) => <li key={c.name}>{c.name}: {c.keys}</li>)}</ul>
              <p className="mt-1 break-all">Razorpay webhook URL: {siteUrl()}/api/webhooks/razorpay</p>
            </details>
          </Panel>
          <Panel title="Team">
            <ul className="space-y-1.5 text-sm">
              {team.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2"><span className="min-w-0"><b className="block truncate">{t.name}</b><span className="block truncate text-xs text-ink-soft">{t.email} · {t.role}{t.lastLoginAt ? ` · seen ${formatDateTime(t.lastLoginAt)}` : ""}</span></span>
                  {me.role === "owner" && t.id !== me.id && <StaffToggle id={t.id} active={t.active} />}</li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
