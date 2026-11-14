import type { Metadata } from "next";
import { asc } from "drizzle-orm";
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
  const [me, s, team] = await Promise.all([requireAdmin(), getSettingsFresh(), db.select().from(schema.admins).orderBy(asc(schema.admins.createdAt))]);
  const conn = [
    { name: "Razorpay payments", on: razorpayConfigured(), keys: "RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET" },
    { name: "Email via Resend", on: emailConfigured(), keys: "RESEND_API_KEY, EMAIL_FROM" },
    { name: "WhatsApp Cloud API", on: whatsappConfigured(), keys: "WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID" },
  ];
  return (
    <>
      <PageHead title="Settings" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="xl:col-span-2"><SettingsForm initial={s} isOwner={me.role === "owner"} /></div>
        <div className="space-y-5">
          <Panel title="Connections">
            <ul className="space-y-2.5 text-sm">
              {conn.map((c) => (
                <li key={c.name}><span className="flex items-center justify-between gap-2 font-medium">{c.name}<span className={`rounded-full px-2 py-0.5 text-xs ${c.on ? "bg-pine-soft" : "bg-line"}`}>{c.on ? "Connected" : "Not connected"}</span></span>
                  {!c.on && <span className="block text-xs break-words text-ink-soft">Set {c.keys} in your server&apos;s environment.</span>}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs break-all text-ink-soft">Razorpay webhook URL: {siteUrl()}/api/webhooks/razorpay</p>
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
