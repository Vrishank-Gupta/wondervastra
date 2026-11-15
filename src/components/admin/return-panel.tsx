"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, PackageCheck, RotateCcw, X } from "lucide-react";
import { approveReturnAction, receiveReturnAction, refundReturnAction, rejectReturnAction } from "@/app/admin/actions";
import { money } from "@/lib/format";
import { Panel } from "./ui";

type Props = {
  ret: { id: string; orderId: string; status: string; reason: string; details: string | null; adminNote: string | null; photos: string[]; pickupAwb: string | null; pickupStatus: string | null; createdAt: number; confirmedCondition: boolean };
  lines: { name: string; label: string | null; qty: number; image: string | null }[];
  suggestedRefund: number;
  canRefund: boolean;
  delhivery: boolean;
};
const STATUS: Record<string, string> = { requested: "Waiting for your decision", approved: "Approved, waiting for pickup", picked_up: "Picked up, on its way to you", received: "Received, refund due", completed: "Refunded", rejected: "Rejected" };

/** One return, start to finish: look, decide, receive, refund. */
export function ReturnPanel({ ret, lines, suggestedRefund, canRefund, delhivery }: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [restock, setRestock] = useState(true);
  const [amount, setAmount] = useState(String(suggestedRefund / 100));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ error?: string; message?: string } & Record<string, unknown>>, ok: string) => {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.message ?? ok });
    if (!r.error) router.refresh();
  };
  return (
    <Panel title="Return request">
      <div className="space-y-3" data-testid="admin-return">
        <p className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${ret.status === "requested" || ret.status === "received" ? "bg-clay-soft" : ret.status === "rejected" ? "bg-sand-soft" : "bg-pine-soft"}`}><RotateCcw size={14} aria-hidden /> {STATUS[ret.status] ?? ret.status}</p>
        <ul className="space-y-1.5">
          {lines.map((l, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              {l.image && <img src={l.image} alt="" className="size-10 rounded-sm border border-line object-contain" />}
              <span><b>{l.qty} ×</b> {l.name}{l.label ? <span className="text-ink-soft"> · {l.label}</span> : null}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm"><span className="text-ink-soft">Reason:</span> <b>{ret.reason}</b>{ret.details ? ` · ${ret.details}` : ""}</p>
        <p className="text-xs text-ink-soft">{ret.confirmedCondition ? "Customer confirmed the items are unused, unwashed, undamaged and in original packaging." : "Customer didn't confirm the condition."} Requested {new Date(ret.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.</p>
        {ret.photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ret.photos.map((u, i) => <button key={u} type="button" onClick={() => setZoom(u)} className="size-20 overflow-hidden rounded-sm border border-line bg-white" aria-label={`Open return photo ${i + 1}`}><img src={u} alt="" className="size-full object-cover" /></button>)}
          </div>
        )}
        {ret.pickupAwb && <p className="text-sm"><span className="text-ink-soft">Return pickup AWB</span> <b className="font-mono">{ret.pickupAwb}</b>{ret.pickupStatus ? ` · ${ret.pickupStatus}` : ""} <a className="underline" href={`https://www.delhivery.com/track-v2/package/${ret.pickupAwb}`} target="_blank" rel="noreferrer">Track</a></p>}
        {ret.adminNote && <p className="text-sm"><span className="text-ink-soft">{ret.status === "rejected" ? "Your reason (customer sees this):" : "Your note:"}</span> {ret.adminNote}</p>}

        {ret.status === "requested" && !rejecting && (
          <div className="space-y-2 rounded-sm bg-ivory p-3">
            <label className="label text-xs" htmlFor="ret-note">Note for the customer (optional)</label>
            <input id="ret-note" className="input" maxLength={300} placeholder="e.g. Please keep the items in their original pack" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} className="btn btn-primary btn-sm" onClick={() => run(() => approveReturnAction(ret.id, note), delhivery ? "Approved. Delhivery pickup booked and the customer is told." : "Approved. Arrange the pickup; the customer is told.")}><Check size={15} aria-hidden /> Approve{delhivery ? " and book pickup" : ""}</button>
              <button disabled={busy} className="btn btn-white btn-sm" onClick={() => setRejecting(true)}><X size={15} aria-hidden /> Reject</button>
            </div>
          </div>
        )}
        {ret.status === "requested" && rejecting && (
          <div className="space-y-2 rounded-sm bg-clay-soft p-3">
            <label className="label text-xs" htmlFor="ret-why">Why can&apos;t you accept it? The customer sees this.</label>
            <input id="ret-why" className="input" maxLength={300} placeholder="e.g. The photos show the item has been washed" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-2">
              <button disabled={busy} className="btn btn-ink btn-sm" onClick={() => run(() => rejectReturnAction(ret.id, note), "Rejected. The customer is told why.")}>Reject return</button>
              <button className="btn btn-white btn-sm" onClick={() => setRejecting(false)}>Back</button>
            </div>
          </div>
        )}
        {["approved", "picked_up"].includes(ret.status) && (
          <div className="space-y-2 rounded-sm bg-ivory p-3">
            <p className="text-sm">When the parcel reaches you, check the items, then:</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put these pieces back in stock</label>
            <button disabled={busy} className="btn btn-primary btn-sm" onClick={() => run(() => receiveReturnAction(ret.id, restock), "Marked received. Now send the refund.")}><PackageCheck size={15} aria-hidden /> Mark received</button>
          </div>
        )}
        {ret.status === "received" && (canRefund ? (
          <div className="flex flex-wrap items-end gap-2 rounded-sm bg-ivory p-3">
            <div><label className="label text-xs" htmlFor="ret-amt">Refund (after discounts)</label><div className="flex items-center gap-1">₹<input id="ret-amt" className="input w-28" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></div></div>
            <button disabled={busy} className="btn btn-primary btn-sm" onClick={() => run(() => refundReturnAction(ret.orderId, Math.round(Number(amount) * 100)), "Refund sent.")}>Refund {money(Math.round(Number(amount) * 100) || 0)}</button>
            <p className="w-full text-xs text-ink-soft">Suggested: what the returned pieces cost after the order&apos;s discounts.</p>
          </div>
        ) : <p className="text-sm text-ink-soft">This order wasn&apos;t paid online. Pay the customer back yourself, then note it on the order.</p>)}
        {msg && <p className={`rounded-sm p-2.5 text-sm font-medium ${msg.ok ? "bg-pine-soft" : "bg-clay-soft"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      </div>
      {zoom && (
        <div role="dialog" aria-modal="true" aria-label="Return photo" className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Return photo" className="max-h-full max-w-full object-contain" />
          <button type="button" aria-label="Close photo" className="absolute top-3 right-3 grid size-11 place-items-center rounded-full bg-white"><X size={22} /></button>
        </div>
      )}
    </Panel>
  );
}
