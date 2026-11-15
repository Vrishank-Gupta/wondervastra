"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Printer, Truck, XCircle } from "lucide-react";
import { cancelShipmentAction, refreshTracking, setupPickupAction, shipNowAction, shippingLabel } from "@/app/admin/actions";
import { money } from "@/lib/format";
import { Panel } from "./ui";

type Props = {
  orderId: string;
  status: string;
  ready: boolean;
  booked: { awb: string; trackingUrl: string | null; courierStatus: string | null; statusAt: number | null; etaAt: number | null; cost: number | null } | null;
  quote: { grams: number; pieces: number; cost: number | null; transit: number | null } | null;
  shipTo?: string;
  setup?: { name: string; phone: string; state: string };
};
const day = (t: number) => new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** Book, label, cancel and track a Delhivery shipment for one order, in plain words. */
export function DelhiveryPanel({ orderId, status, ready, booked, quote, shipTo, setup }: Props) {
  const router = useRouter();
  const [grams, setGrams] = useState(String(quote?.grams ?? 500));
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editWeight, setEditWeight] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<{ error?: string } & Record<string, unknown>>, ok: (r: Record<string, unknown>) => string) => {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: ok(r) });
    if (!r.error) router.refresh();
  };

  if (!ready) return <PickupSetup defaults={setup} />;
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
            <p className="text-xs text-ink-soft">Next: print the label and stick it on the parcel. Tracking updates every 15 minutes: the order moves to Shipped, Out for delivery and Delivered by itself, and the customer gets a message each time.</p>
          </>
        ) : canBook ? (
          <>
            <button disabled={busy} className="btn btn-primary w-full text-base sm:w-auto" data-testid="ship-now" onClick={() => run(() => shipNowAction(orderId, Number(grams)), (r) => `Booked. AWB ${r.awb}. ${r.pickup ?? ""} Print the label and stick it on the parcel.`)}>
              <Truck size={18} aria-hidden /> {busy ? "Booking…" : "Ship with Delhivery"}
            </button>
            <p className="text-sm text-ink-soft">
              One tap books the shipment to <b className="text-ink">{shipTo}</b> and the courier pickup.{" "}
              {quote?.cost != null ? <>Costs you about <b className="text-ink">{money(quote.cost)}</b>. </> : null}
              {quote?.transit != null ? <>Delivers about {quote.transit} {quote.transit === 1 ? "day" : "days"} after pickup. </> : null}
              Parcel: <b className="text-ink">{grams} g</b>{quote ? ` (${quote.pieces} ${quote.pieces === 1 ? "piece" : "pieces"})` : ""}.{" "}
              {!editWeight && <button type="button" className="underline" onClick={() => setEditWeight(true)}>Change weight</button>}
            </p>
            {editWeight && <div><label className="label text-xs" htmlFor="dl-grams">Parcel weight</label><div className="flex items-center gap-2"><input id="dl-grams" className="input w-28" type="number" inputMode="numeric" min="50" value={grams} onChange={(e) => setGrams(e.target.value)} /><span className="text-sm text-ink-soft">grams</span></div></div>}
          </>
        ) : (
          <p className="text-sm text-ink-soft">Shipments can be booked for confirmed or packed orders.</p>
        )}
        {msg && <p className={`rounded-sm p-2.5 text-sm font-medium ${msg.ok ? "bg-pine-soft" : "bg-clay-soft"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      </div>
    </Panel>
  );
}

/** One-time: your pickup address, registered with Delhivery from here. */
function PickupSetup({ defaults }: { defaults?: { name: string; phone: string; state: string } }) {
  const router = useRouter();
  const [existing, setExisting] = useState(false);
  const [f, setF] = useState({ name: defaults?.name ?? "WonderVastra", address: "", city: "", state: defaults?.state || "Delhi", pin: "", phone: defaults?.phone ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Panel title="Ship with Delhivery">
      <form className="space-y-3" data-testid="pickup-setup" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr("");
        const r = await setupPickupAction({ ...f, existing });
        setBusy(false);
        if (r.error) setErr(r.error); else router.refresh();
      }}>
        <p className="text-sm">One-time setup: where should Delhivery collect parcels from? After this, every order ships with one tap.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label text-xs" htmlFor="pk-name">{existing ? "Pickup address name in Delhivery One" : "Name for this address"}</label><input id="pk-name" className="input" value={f.name} onChange={set("name")} /></div>
          <div><label className="label text-xs" htmlFor="pk-pin">Pincode</label><input id="pk-pin" className="input" inputMode="numeric" maxLength={6} value={f.pin} onChange={set("pin")} /></div>
          {!existing && <>
            <div className="sm:col-span-2"><label className="label text-xs" htmlFor="pk-addr">Address (house/shop, street, area)</label><input id="pk-addr" className="input" value={f.address} onChange={set("address")} /></div>
            <div><label className="label text-xs" htmlFor="pk-city">City</label><input id="pk-city" className="input" value={f.city} onChange={set("city")} /></div>
            <div><label className="label text-xs" htmlFor="pk-state">State</label><input id="pk-state" className="input" value={f.state} onChange={set("state")} /></div>
            <div><label className="label text-xs" htmlFor="pk-phone">Phone for the courier</label><input id="pk-phone" className="input" inputMode="tel" value={f.phone} onChange={set("phone")} /></div>
          </>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={busy} className="btn btn-primary btn-sm">{busy ? "Saving…" : existing ? "Use this pickup address" : "Save pickup address"}</button>
          <button type="button" className="text-sm underline" onClick={() => { setExisting(!existing); setErr(""); }}>{existing ? "Add a new address instead" : "Already set up in Delhivery One?"}</button>
        </div>
        {err && <p className="rounded-sm bg-clay-soft p-2.5 text-sm font-medium" role="alert">{err}</p>}
      </form>
    </Panel>
  );
}
