"use client";
import { useState } from "react";
import { Truck } from "lucide-react";
import { bookPickup, refreshTracking } from "@/app/admin/actions";
import { WalletBalance } from "./wallet-balance";

/** "Ask Delhivery to collect today's parcels": date, time and how many, with the booked parcels counted for you. */
export function PickupRequest({ waiting, wallet }: { waiting: number; wallet?: number | null }) {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400_000);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(iso(today.getHours() >= 14 ? tomorrow : today));
  const [time, setTime] = useState("14:00");
  const [count, setCount] = useState(String(Math.max(1, waiting)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="mb-4 rounded-sm border border-line bg-white p-3" data-testid="pickup">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm"><Truck size={16} aria-hidden className="mr-1.5 inline" /><b>Delhivery:</b> {waiting ? `${waiting} booked ${waiting === 1 ? "parcel is" : "parcels are"} waiting for pickup.` : "No parcels waiting for pickup."}</p>
        <div className="flex gap-2">
          <button disabled={busy} className="btn btn-white btn-sm" onClick={async () => { setBusy(true); setMsg(null); const r = await refreshTracking(); setBusy(false); setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.updated ? `Tracking updated on ${r.updated} ${r.updated === 1 ? "order" : "orders"}.` : "No new tracking updates." }); }}>Check tracking now</button>
          {!open && <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Request a pickup</button>}
        </div>
      </div>
      {wallet !== undefined && <div className="mt-2"><WalletBalance balance={wallet} compact /></div>}
      {open && (
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setMsg(null);
          const r = await bookPickup({ date, time, count: Number(count) });
          setBusy(false);
          setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Pickup booked (request ${r.pickupId}). Keep the parcels labelled and ready.` });
          if (!r.error) setOpen(false);
        }}>
          <div><label className="label text-xs" htmlFor="pk-date">Pickup date</label><input id="pk-date" type="date" className="input" min={iso(today)} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="label text-xs" htmlFor="pk-time">From</label><input id="pk-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <div><label className="label text-xs" htmlFor="pk-count">Parcels</label><input id="pk-count" type="number" min="1" className="input w-20" value={count} onChange={(e) => setCount(e.target.value)} /></div>
          <button disabled={busy} className="btn btn-primary btn-sm">Book pickup</button>
          <button type="button" className="btn btn-white btn-sm" onClick={() => setOpen(false)}>Not now</button>
        </form>
      )}
      {msg && <p className={`mt-2 rounded-sm p-2.5 text-sm font-medium ${msg.ok ? "bg-pine-soft" : "bg-clay-soft"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </div>
  );
}
