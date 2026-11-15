"use client";
import { useState } from "react";
import { sendSummaryNow } from "@/app/admin/actions";

/** "Send it now": a sample of the morning email, straight away. */
export function SummaryNow() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-white btn-sm" disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        const r = await sendSummaryNow();
        setBusy(false);
        setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Sent to ${r.to}. Check your inbox in a minute.` });
      }}>{busy ? "Sending…" : "Send today's summary now"}</button>
      {msg && <span className={`text-sm font-medium ${msg.ok ? "text-pine" : "text-clay"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
    </div>
  );
}
