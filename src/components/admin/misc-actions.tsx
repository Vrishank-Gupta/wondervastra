"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { moderateReview, resendNotification, setCustomerBlocked, setStaffActive } from "@/app/admin/actions";

export function CustomerBlock({ id, blocked }: { id: string; blocked: boolean }) {
  const router = useRouter();
  return <button className={`rounded-full border px-2 py-0.5 text-xs font-medium ${blocked ? "border-clay bg-clay-soft" : "border-line"}`} onClick={async () => { await setCustomerBlocked(id, !blocked); router.refresh(); }}>{blocked ? "Blocked: unblock" : "Block"}</button>;
}
export function ReviewActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const go = async (s: "approved" | "rejected") => { await moderateReview(id, s); router.refresh(); };
  return (
    <div className="flex gap-1.5">
      {status !== "approved" && <button className="btn btn-white btn-sm" onClick={() => go("approved")}>Publish</button>}
      {status !== "rejected" && <button className="btn btn-white btn-sm" onClick={() => go("rejected")}>Hide</button>}
    </div>
  );
}
export function ResendButton({ id }: { id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <span className="flex items-center gap-2">
      <button className="rounded-full border border-line px-2 py-0.5 text-xs font-medium" disabled={busy} onClick={async () => { setBusy(true); const r = await resendNotification(id); setBusy(false); setMsg(r.error ?? r.message ?? ""); router.refresh(); }}>Retry</button>
      {msg && <span className="text-xs">{msg}</span>}
    </span>
  );
}
export function StaffToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  return <button className="rounded-full border border-line px-2 py-0.5 text-xs font-medium" onClick={async () => { await setStaffActive(id, !active); router.refresh(); }}>{active ? "Disable" : "Enable"}</button>;
}
