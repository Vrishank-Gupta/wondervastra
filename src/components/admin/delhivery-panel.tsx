"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Printer, Truck, XCircle } from "lucide-react";
import { bookShipment, cancelShipmentAction, refreshTracking, shippingLabel } from "@/app/admin/actions";
import { money } from "@/lib/format";
import { Panel } from "./ui";

type Props = {
  orderId: string;
  status: string;
  ready: boolean;
  booked: { awb: string; trackingUrl: string | null; courierStatus: string | null; statusAt: number | null; etaAt: number | null; cost: number | null } | null;
  quote: { grams: number; pieces: number; cost: number | null; transit: number | null } | null;
};
const day = (t: number) => new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** Book, label, cancel and track a Delhivery shipment for one order, in plain words. */
export function DelhiveryPanel({ orderId, status, ready, booked, quote }: Props) {
  const router = useRouter();
  const [grams, setGrams] = useState(String(quote?.grams ?? 500));
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<{ error?: string } & Record<string, unknown>>, ok: (r: Record<string, unknown>) => string) => {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: ok(r) });
    if (!r.error) router.refresh();
  };

  if (!ready) {
    return (
      <Panel title="Delhivery">
        <p className="text-sm">To book shipments from here, add your Delhivery pickup address name and its pincode in <a className="font-medium underline" href="/admin/settings">Settings → Delhivery shipping</a>.</p>
      </Panel>
    );
  }
  const canBook = !booked && ["confirmed", "packed"].includes(status);
  return (
    <Panel title="Delhivery" >
      <div className="space-y-3" data-testid="delhivery">
        {booked ? (
          <>
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <p><span className="text-ink-soft">AWB</span> <b className="font-mono">{booked.awb}</b></p>
              {booked.etaAt && <p><span className="text-ink-soft">Expected delivery</span> <b>{day(booked.etaAt)}</b></p>}
              {booked.courierStatus && <p className="sm:col-span-2"><span className="text-ink-soft">Latest update</span> {booked.courierStatus}{booked.statusAt ? <span className="text-ink-soft"> · {new Date(booked.statusAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span> : null}</p>}
              {booked.cost != null && <p><span className="text-ink-soft">Shipping cost</span> {money(booked.cost)}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} className="btn btn-primary btn-sm" onClick={async () => {
                setBusy(true); setMsg(null);
                const r = await shippingLabel(orderId);
                setBusy(false);
                if (r.url) window.open(r.url, "_blank", "noopener"); else setMsg({ ok: false, text: r.error ?? "Couldn't get the label." });
              }}><Printer size={15} aria-hidden /> Print shipping label</button>
              {booked.trackingUrl && <a className="btn btn-white btn-sm" href={booked.trackingUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden /> Track on Delhivery</a>}
              <button disabled={busy} className="btn btn-white btn-sm" onClick={() => run(() => refreshTracking(), (r) => (r.updated ? "Tracking updated." : "No new updates from Delhivery yet."))}><Truck size={15} aria-hidden /> Check for updates</button>
              {["confirmed", "packed"].includes(status) && (confirmCancel
                ? <span className="flex items-center gap-2 text-sm">Cancel this shipment?
                    <button disabled={busy} className="btn btn-white btn-sm text-clay" onClick={() => { setConfirmCancel(false); run(() => cancelShipmentAction(orderId), () => "Shipment cancelled. You can book it again."); }}>Yes, cancel it</button>
                    <button className="btn btn-white btn-sm" onClick={() => setConfirmCancel(false)}>Keep it</button></span>
                : <button disabled={busy} className="btn btn-white btn-sm" onClick={() => setConfirmCancel(true)}><XCircle size={15} aria-hidden /> Cancel shipment</button>)}
            </div>
            <p className="text-xs text-ink-soft">Tracking updates every 15 minutes. The order moves to Shipped, Out for delivery and Delivered by itself, and the customer gets a message each time.</p>
          </>
        ) : canBook ? (
          <>
            <p className="text-sm">
              {quote?.cost != null ? <>Shipping costs you about <b>{money(quote.cost)}</b> (with GST). </> : null}
              {quote?.transit != null ? <>Delhivery takes about <b>{quote.transit} {quote.transit === 1 ? "day" : "days"}</b> after pickup.</> : null}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div><label className="label text-xs" htmlFor="dl-grams">Parcel weight</label><div className="flex items-center gap-2"><input id="dl-grams" className="input w-24" type="number" inputMode="numeric" min="50" value={grams} onChange={(e) => setGrams(e.target.value)} /><span className="text-sm text-ink-soft">grams{quote ? ` (${quote.pieces} ${quote.pieces === 1 ? "piece" : "pieces"})` : ""}</span></div></div>
              <button disabled={busy} className="btn btn-primary btn-sm" onClick={() => run(() => bookShipment(orderId, Number(grams)), (r) => `Booked. AWB ${r.awb}. Print the label and stick it on the parcel.`)}><Truck size={15} aria-hidden /> Book Delhivery shipment</button>
            </div>
            <p className="text-xs text-ink-soft">Booking gets an AWB, fills in tracking, and marks the order Packed. Then print the label and request a pickup from the Orders page.</p>
          </>
        ) : (
          <p className="text-sm text-ink-soft">Shipments can be booked for confirmed or packed orders.</p>
        )}
        {msg && <p className={`rounded-sm p-2.5 text-sm font-medium ${msg.ok ? "bg-pine-soft" : "bg-clay-soft"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      </div>
    </Panel>
  );
}
