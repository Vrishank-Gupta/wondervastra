"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { addOrderNote, refundOrder, setOrderStatus, updateShipment } from "@/app/admin/actions";
import { COURIERS, courierLink } from "@/lib/couriers";
import { money, STATUS_LABEL } from "@/lib/format";
import type { OrderStatus } from "@/db/schema";
import { Panel } from "./ui";

type Props = {
  order: { id: string; status: OrderStatus; courier: string | null; awb: string | null; trackingUrl: string | null; total: number; refundedTotal: number; paymentStatus: string; paymentMethod: string };
  nextStatuses: OrderStatus[];
  /** "email", "email and WhatsApp", or "" when no channel is connected. */
  notifyVia: string;
};

export function OrderManager({ order, nextStatuses, notifyVia }: Props) {
  const router = useRouter();
  const [courier, setCourier] = useState(order.courier ?? "");
  const [awb, setAwb] = useState(order.awb ?? "");
  const [url, setUrl] = useState(order.trackingUrl ?? "");
  const [note, setNote] = useState("");
  const [refund, setRefund] = useState("");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [confirm, setConfirm] = useState<OrderStatus | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (fn: () => Promise<{ error?: string; message?: string }>, okText = "Saved.") => {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.message ?? okText });
    if (!r.error) router.refresh();
    return !r.error;
  };
  const canShip = order.status === "confirmed" || order.status === "packed";
  const showShipment = canShip || ["shipped", "out_for_delivery"].includes(order.status);
  const refundable = order.total - order.refundedTotal;
  const canRefund = ["paid", "partially_refunded"].includes(order.paymentStatus) && refundable > 0;
  const danger = (s: OrderStatus) => s === "cancelled" || s === "returned";
  const auto = courierLink(courier, awb.trim());

  return (
    <>
      {msg && <p className={`rounded-sm border p-3 text-sm font-medium ${msg.ok ? "border-pine bg-pine-soft" : "border-clay bg-clay-soft"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      {nextStatuses.length > 0 && (
        <Panel title="Update status">
          <p className="mb-2 text-xs text-ink-soft">{notifyVia ? `The customer is notified by ${notifyVia}.` : "No messages are sent automatically yet: use “Send on WhatsApp” below to tell the customer."}</p>
          <div className="flex flex-wrap gap-2">
            {nextStatuses.filter((s) => s !== "shipped").map((s) => (
              <button key={s} disabled={busy} className={`btn btn-sm ${danger(s) ? "btn-white" : "btn-white"}`} onClick={() => (danger(s) ? setConfirm(s) : run(() => setOrderStatus(order.id, s), `Marked as ${STATUS_LABEL[s]}.`)) }>
                {danger(s) ? (s === "cancelled" ? "Cancel order" : "Mark returned") : `Mark ${STATUS_LABEL[s].toLowerCase()}`}
              </button>
            ))}
          </div>
          {confirm && (
            <div className="mt-3 rounded-sm border border-line bg-clay-soft p-3 text-sm" role="alert">
              <p className="font-medium">{confirm === "cancelled" ? "Cancel this order? Stock goes back and the customer is told." : "Mark as returned?"}</p>
              {confirm === "returned" && <label className="mt-1 flex items-center gap-2"><input type="checkbox" className="size-4" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put items back in stock</label>}
              <div className="mt-2 flex gap-2">
                <button disabled={busy} className="btn btn-ink btn-sm" onClick={async () => { await run(() => setOrderStatus(order.id, confirm, { restock })); setConfirm(null); }}>Confirm</button>
                <button className="btn btn-white btn-sm" onClick={() => setConfirm(null)}>Go back</button>
              </div>
            </div>
          )}
        </Panel>
      )}
      {showShipment && (
        <Panel title="Shipment">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="courier">Courier</label>
              <select id="courier" className="input" value={courier} onChange={(e) => setCourier(e.target.value)}><option value="">Select courier</option>{COURIERS.map((c) => <option key={c.name}>{c.name}</option>)}{courier && !COURIERS.some((c) => c.name === courier) && <option>{courier}</option>}</select>
            </div>
            <div><label className="label" htmlFor="awb">AWB / tracking number</label><input id="awb" className="input font-mono" value={awb} onChange={(e) => setAwb(e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="turl">Tracking link</label><input id="turl" className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={auto ?? "https://…"} />
              {auto && !url && <p className="mt-1 text-xs text-ink-soft">Left blank, we&apos;ll use the {courier} link for this AWB automatically.</p>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {canShip && <button disabled={busy || (!awb.trim() && !url.trim())} className="btn btn-primary btn-sm" onClick={() => run(() => updateShipment(order.id, { courier, awb, trackingUrl: url, markShipped: true }), notifyVia ? `Marked shipped. Tracking link sent by ${notifyVia}.` : "Marked shipped. Send the tracking link with “Send on WhatsApp” below.")}>{busy && <Loader2 size={14} className="animate-spin" aria-hidden />}Save & mark shipped</button>}
            <button disabled={busy} className="btn btn-white btn-sm" onClick={() => run(() => updateShipment(order.id, { courier, awb, trackingUrl: url, markShipped: false }))}>Save details only</button>
          </div>
        </Panel>
      )}
      {canRefund && (
        <Panel title="Refund">
          <p className="mb-2 text-xs text-ink-soft">{order.paymentMethod === "razorpay" ? "Sends the money back through Razorpay." : "COD order: this only records it. Pay the buyer yourself by UPI or bank."} Up to {money(refundable)}.</p>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Refund amount in rupees" className="input w-32" type="number" min="1" step="0.01" placeholder="₹" value={refund} onChange={(e) => setRefund(e.target.value)} />
            <button type="button" className="btn btn-white btn-sm" onClick={() => setRefund(String(refundable / 100))}>Full</button>
            <input aria-label="Refund reason" className="input min-w-40 flex-1" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            {!confirmRefund
              ? <button disabled={!refund} className="btn btn-ink btn-sm" onClick={() => setConfirmRefund(true)}>Refund</button>
              : <button disabled={busy} className="btn btn-primary btn-sm" onClick={async () => { await run(() => refundOrder(order.id, Math.round(Number(refund) * 100), reason)); setConfirmRefund(false); setRefund(""); }}>Confirm ₹{refund}</button>}
          </div>
        </Panel>
      )}
      <Panel title="Internal note">
        <div className="flex gap-2">
          <input aria-label="Internal note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only your team sees this" />
          <button disabled={busy || !note.trim()} className="btn btn-white btn-sm" onClick={async () => { if (await run(() => addOrderNote(order.id, note), "Note added.")) setNote(""); }}>Add</button>
        </div>
      </Panel>
    </>
  );
}
