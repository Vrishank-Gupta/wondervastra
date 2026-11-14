"use client";
import { STATES } from "@/lib/states";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addStaff, changeOwnPassword, updateSettings } from "@/app/admin/actions";
import type { StoreSettings } from "@/lib/settings";
import { Panel } from "./ui";
import { deliversTo, NCR_PINCODES, parsePincodes } from "@/lib/delivery-area";

export type AreaDemand = { total: number; top: { pincode: string; place: string | null; n: number }[]; recent: { pincode: string; contact: string; at: number }[] };

export function SettingsForm({ initial, isOwner, demand }: { initial: StoreSettings; isOwner: boolean; demand?: AreaDemand }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [staff, setStaff] = useState({ name: "", email: "", password: "" });
  const [testPin, setTestPin] = useState("");
  const parsed = parsePincodes(s.deliveryPincodes);
  const up = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const text = (k: keyof StoreSettings, label: string, ph = "") => (
    <div><label className="label" htmlFor={k}>{label}</label><input id={k} className="input" placeholder={ph} value={String(s[k] ?? "")} onChange={(e) => up(k, e.target.value as never)} /></div>
  );
  const rupees = (k: keyof StoreSettings, label: string) => (
    <div><label className="label" htmlFor={k}>{label}</label><input id={k} className="input" type="number" min="0" value={Number(s[k]) / 100} onChange={(e) => up(k, Math.round(Number(e.target.value) * 100) as never)} /></div>
  );
  const num = (k: keyof StoreSettings, label: string) => (
    <div><label className="label" htmlFor={k}>{label}</label><input id={k} className="input" type="number" min="0" value={Number(s[k])} onChange={(e) => up(k, Number(e.target.value) as never)} /></div>
  );
  const toggle = (k: keyof StoreSettings, label: string) => (
    <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-ink" checked={Boolean(s[k])} onChange={(e) => up(k, e.target.checked as never)} /> {label}</label>
  );
  return (
    <div className="space-y-5">
      {msg && <p className={`rounded-sm p-3 text-sm font-medium ${msg.ok ? "bg-pine-soft" : "bg-clay-soft"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      <form className="space-y-5" onSubmit={async (e) => {
        e.preventDefault();
        const r = await updateSettings(s);
        setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Settings saved." });
        if (!r.error) router.refresh();
      }}>
        <fieldset disabled={!isOwner} className="space-y-5">
          <Panel title="Store">
            <div className="grid gap-3 sm:grid-cols-2">
              {text("storeName", "Store name")}{text("tagline", "Tagline")}
              <div className="sm:col-span-2">{text("announcement", "Top announcement bar", "Blank = shows your live sale or free-delivery offer")}</div>
              {text("whatsappNumber", "Support WhatsApp number", "9876543210")}{text("supportEmail", "Support email")}
              {text("supportHours", "Support hours", "Mon–Sat, 10am–7pm")}{text("whatsappGroupUrl", "WhatsApp group invite link", "https://chat.whatsapp.com/…")}
              {text("instagramUrl", "Instagram URL")}{text("facebookUrl", "Facebook URL")}
            </div>
            <p className="mt-2 text-xs text-ink-soft">The support number and email show in the footer, on the Contact page and as a chat button. The group link adds a “Join our WhatsApp group” invite on the home page, in the footer and after each order. In WhatsApp: open the group → Invite via link → Copy link.</p>
          </Panel>
          <Panel title="Business details (for invoices and policy pages)">
            <div className="grid gap-3 sm:grid-cols-2">
              {text("legalName", "Legal business name")}{text("gstin", "GSTIN (if registered)")}
              <div><label className="label" htmlFor="bstate">Registered state</label><select id="bstate" className="input w-full min-w-0 truncate" value={s.businessState} onChange={(e) => up("businessState", e.target.value)}><option value="">Choose state</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="ba">Business address</label><textarea id="ba" className="input" rows={2} value={s.businessAddress} onChange={(e) => up("businessAddress", e.target.value)} /></div>
            </div>
          </Panel>
          <Panel title="Delivery area">
            <div className="grid gap-3 sm:grid-cols-2">
              {text("deliveryAreaName", "Area name shown to buyers", "Delhi NCR")}
              <div><label className="label" htmlFor="testpin">Check a pincode</label>
                <div className="flex items-center gap-2"><input id="testpin" className="input" inputMode="numeric" maxLength={6} placeholder="110017" value={testPin} onChange={(e) => setTestPin(e.target.value.replace(/\D/g, ""))} />
                  {testPin.length === 6 && <span className={`shrink-0 text-sm font-semibold ${deliversTo(testPin, s.deliveryPincodes) ? "text-pine" : "text-clay"}`}>{deliversTo(testPin, s.deliveryPincodes) ? "Delivers" : "Not covered"}</span>}</div></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="deliveryPincodes">Pincodes you deliver to</label>
                <textarea id="deliveryPincodes" className="input font-mono text-xs" rows={6} value={s.deliveryPincodes} onChange={(e) => up("deliveryPincodes", e.target.value)} placeholder="Blank = all of India" />
                <p className="mt-1 text-xs text-ink-soft">One per line or comma-separated: a pincode (110017), a range (110001-110099) or a prefix (110 = every pincode starting 110). Blank = deliver all over India. {s.deliveryPincodes.trim() ? `${parsed.rules.length} rules.` : ""}{parsed.bad.length ? <b className="text-clay"> Not understood: {parsed.bad.slice(0, 5).join(", ")}</b> : null}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-white btn-sm" onClick={() => { up("deliveryPincodes", NCR_PINCODES); up("deliveryAreaName", "Delhi NCR"); }}>Use Delhi NCR list</button>
                  <button type="button" className="btn btn-white btn-sm" onClick={() => up("deliveryPincodes", "")}>Deliver all over India</button>
                </div>
              </div>
            </div>
            {demand && demand.total > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-sm font-semibold">{demand.total} {demand.total === 1 ? "buyer has" : "buyers have"} asked you to deliver to their area</p>
                <p className="mt-1 text-xs text-ink-soft">Most asked: {demand.top.map((t) => `${t.pincode}${t.place ? ` ${t.place}` : ""} (${t.n})`).join(", ")}</p>
                <details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">Latest requests</summary>
                  <ul className="mt-1 space-y-0.5 text-xs">{demand.recent.map((r, i) => <li key={i}>{r.pincode} · {r.contact}</li>)}</ul>
                </details>
              </div>
            )}
          </Panel>
          <Panel title="Delivery">
            <div className="grid gap-3 sm:grid-cols-2">
              {rupees("defaultDeliveryCharge", "Default charge for new listings ₹")}
              <div><label className="label" htmlFor="sc">When a cart has several charged listings</label>
                <select id="sc" className="input" value={s.shippingCombine} onChange={(e) => up("shippingCombine", e.target.value as "highest" | "sum")}><option value="highest">Charge only the highest (one parcel)</option><option value="sum">Add all charges together</option></select></div>
              {num("dispatchDays", "Dispatch within (working days)")}{num("returnWindowDays", "Return window (days)")}{num("deliveryDaysMin", "Delivery time, from (days)")}{num("deliveryDaysMax", "Delivery time, to (days)")}
            </div>
            <p className="mt-2 text-xs text-ink-soft">Set “free delivery above ₹X” under Discounts → Cart offers.</p>
          </Panel>
          <Panel title="Cash on delivery">
            {toggle("codEnabled", "Offer cash on delivery")}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{rupees("codFee", "COD handling fee ₹")}{rupees("codMaxOrder", "Maximum COD order value ₹")}</div>
          </Panel>
          <Panel title="Feedback & alerts">
            <div className="space-y-2">{toggle("orderFeedbackEnabled", "Ask for feedback after ordering")}{toggle("deliveryFeedbackEnabled", "Ask for feedback and reviews after delivery")}</div>
            <div className="mt-3">{text("adminAlertEmail", "Email me about each new order")}</div>
          </Panel>
          {isOwner ? <button className="btn btn-primary">Save settings</button> : <p className="text-sm text-ink-soft">Only the owner can change settings.</p>}
        </fieldset>
      </form>
      <Panel title="Change my password">
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const r = await changeOwnPassword(cur, next);
          setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.message! });
          if (!r.error) { setCur(""); setNext(""); }
        }}>
          <input aria-label="Current password" className="input min-w-40 flex-1" type="password" autoComplete="current-password" placeholder="Current password" required value={cur} onChange={(e) => setCur(e.target.value)} />
          <input aria-label="New password" className="input min-w-40 flex-1" type="password" autoComplete="new-password" placeholder="New password (8+ characters)" required value={next} onChange={(e) => setNext(e.target.value)} />
          <button className="btn btn-ink btn-sm">Update</button>
        </form>
      </Panel>
      {isOwner && (
        <Panel title="Add a team member">
          <form className="grid gap-2 sm:grid-cols-3" onSubmit={async (e) => {
            e.preventDefault();
            const r = await addStaff(staff.email, staff.name, staff.password);
            setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Team member added." });
            if (!r.error) { setStaff({ name: "", email: "", password: "" }); router.refresh(); }
          }}>
            <input aria-label="Name" className="input" placeholder="Name" required value={staff.name} onChange={(e) => setStaff({ ...staff, name: e.target.value })} />
            <input aria-label="Email" className="input" type="email" placeholder="Email" required value={staff.email} onChange={(e) => setStaff({ ...staff, email: e.target.value })} />
            <input aria-label="Temporary password" className="input" type="password" autoComplete="new-password" placeholder="Temporary password" required value={staff.password} onChange={(e) => setStaff({ ...staff, password: e.target.value })} />
            <button className="btn btn-ink btn-sm sm:col-span-3 sm:w-fit">Add staff</button>
          </form>
          <p className="mt-2 text-xs text-ink-soft">Staff can run orders, listings and discounts, but can&apos;t change settings or team.</p>
        </Panel>
      )}
    </div>
  );
}
