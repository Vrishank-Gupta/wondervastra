"use client";
import { SummaryNow } from "./summary-now";
import { STATES } from "@/lib/states";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { addStaff, changeOwnPassword, updateSettings } from "@/app/admin/actions";
import type { StoreSettings } from "@/lib/settings";
import { Panel } from "./ui";
import { deliversTo, joinArea, NCR_PINCODES, NCR_TOWNS, splitArea } from "@/lib/delivery-area";

export type AreaDemand = { total: number; top: { pincode: string; place: string | null; n: number }[]; recent: { pincode: string; contact: string; at: number }[] };

/** A labelled field with a one-line plain-language hint underneath. */
function Field({ id, label, hint, children, wide = false }: { id: string; label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export function SettingsForm({ initial, isOwner, demand }: { initial: StoreSettings; isOwner: boolean; demand?: AreaDemand }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [staff, setStaff] = useState({ name: "", email: "", password: "" });
  const [testPin, setTestPin] = useState("");
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const area = splitArea(s.deliveryPincodes);
  const allIndia = !s.deliveryPincodes.trim();

  // Leaving with unsaved changes asks first, so nothing typed is lost by accident.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const up = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => { setS((x) => ({ ...x, [k]: v })); setMsg(null); };
  const text = (k: keyof StoreSettings, label: string, hint?: string, ph = "", wide = false) => (
    <Field id={k} label={label} hint={hint} wide={wide}><input id={k} className="input" placeholder={ph} aria-describedby={hint ? `${k}-hint` : undefined} value={String(s[k] ?? "")} onChange={(e) => up(k, e.target.value as never)} /></Field>
  );
  const rupees = (k: keyof StoreSettings, label: string, hint?: string) => (
    <Field id={k} label={label} hint={hint}><div className="flex items-center gap-2"><span aria-hidden>₹</span><input id={k} className="input" type="number" inputMode="numeric" min="0" value={Number(s[k]) / 100} onChange={(e) => up(k, Math.round(Number(e.target.value) * 100) as never)} /></div></Field>
  );
  const days = (k: keyof StoreSettings, label: string, hint?: string) => (
    <Field id={k} label={label} hint={hint}><div className="flex items-center gap-2"><input id={k} className="input w-24" type="number" inputMode="numeric" min="0" value={Number(s[k])} onChange={(e) => up(k, Number(e.target.value) as never)} /><span className="text-sm text-ink-soft">days</span></div></Field>
  );
  const toggle = (k: keyof StoreSettings, label: string) => (
    <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-ink" checked={Boolean(s[k])} onChange={(e) => up(k, e.target.checked as never)} /> {label}</label>
  );
  const setTowns = (towns: string[], extra = area.extra) => up("deliveryPincodes", joinArea(towns, extra));

  async function save() {
    setBusy(true);
    const r = await updateSettings(s);
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: r.error });
    setSaved(s);
    setMsg({ ok: true, text: "Saved. Your store shows the changes now." });
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-20">
      {msg && <p className={`rounded-sm p-3 text-sm font-medium ${msg.ok ? "bg-pine-soft" : "bg-clay-soft"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <fieldset disabled={!isOwner} className="space-y-5">
          <Panel title="How customers reach you">
            <div className="grid gap-4 sm:grid-cols-2">
              {text("whatsappNumber", "Your WhatsApp number", "Customers tap a green chat button to message you.", "9876543210")}
              {text("supportEmail", "Your support email", "Shown on the Contact page and in order emails.", "support@wondervastra.in")}
              {text("supportHours", "When you reply", "Shown next to your number, so customers know when to expect an answer.", "Mon–Sat, 10am–7pm")}
              {text("whatsappGroupUrl", "WhatsApp group invite link", "Adds a “Join our WhatsApp group” button. In WhatsApp: open the group → tap its name → Invite via link → Copy link, then paste here.", "https://chat.whatsapp.com/…")}
              {text("instagramUrl", "Instagram page link", "Optional. Adds an Instagram button in the footer.", "https://instagram.com/…")}
              {text("facebookUrl", "Facebook page link", "Optional.", "https://facebook.com/…")}
            </div>
          </Panel>

          <Panel title="Where you deliver">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-ink" checked={allIndia} onChange={(e) => up("deliveryPincodes", e.target.checked ? "" : NCR_PINCODES)} /> Deliver all over India</label>
            {!allIndia && (
              <div className="mt-3 space-y-4">
                <fieldset>
                  <legend className="label">Tick the areas you deliver to</legend>
                  <div className="flex flex-wrap gap-2">
                    {NCR_TOWNS.map((t) => {
                      const on = area.towns.includes(t.name);
                      return (
                        <label key={t.name} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium ${on ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>
                          <input type="checkbox" className="sr-only" checked={on} onChange={(e) => setTowns(e.target.checked ? [...area.towns, t.name] : area.towns.filter((x) => x !== t.name))} />{on && <Check size={14} aria-hidden />}{t.name}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <Field id="extraPins" label="Any other pincodes (optional)" hint="Type pincodes separated by commas, e.g. 122505, 131001. A range like 110001-110099 also works.">
                  <input id="extraPins" className="input" inputMode="numeric" value={area.extra} onChange={(e) => setTowns(area.towns, e.target.value)} placeholder="122505, 131001" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  {text("deliveryAreaName", "Name customers see", "Used in messages like “We deliver across Delhi NCR”.", "Delhi NCR")}
                  <Field id="testpin" label="Check a pincode" hint="Type any pincode to see if you deliver there.">
                    <div className="flex items-center gap-2"><input id="testpin" className="input" inputMode="numeric" maxLength={6} placeholder="110017" value={testPin} onChange={(e) => setTestPin(e.target.value.replace(/\D/g, ""))} />
                      {testPin.length === 6 && <span className={`shrink-0 text-sm font-semibold ${deliversTo(testPin, s.deliveryPincodes) ? "text-pine" : "text-clay"}`}>{deliversTo(testPin, s.deliveryPincodes) ? "Delivers" : "Not covered"}</span>}</div>
                  </Field>
                </div>
                {!area.towns.length && !area.extra.trim() && <p className="text-sm font-medium text-clay">Tick at least one area, or tick “Deliver all over India”.</p>}
              </div>
            )}
            {demand && demand.total > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-sm font-semibold">{demand.total} {demand.total === 1 ? "customer has" : "customers have"} asked you to deliver to their area</p>
                <p className="mt-1 text-xs text-ink-soft">Most asked: {demand.top.map((t) => `${t.pincode}${t.place ? ` ${t.place}` : ""} (${t.n})`).join(", ")}</p>
                <details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">See who asked</summary>
                  <ul className="mt-1 space-y-0.5 text-xs">{demand.recent.map((r, i) => <li key={i}>{r.pincode} · {r.contact}</li>)}</ul>
                </details>
              </div>
            )}
          </Panel>

          <Panel title="Delivery charges and time">
            <div className="grid gap-4 sm:grid-cols-2">
              {rupees("defaultDeliveryCharge", "Usual delivery charge", "Filled in on each new listing. You can change it per listing.")}
              <Field id="sc" label="If one order has items with different delivery charges" hint="Most shops charge once per parcel.">
                <select id="sc" className="input" value={s.shippingCombine} onChange={(e) => up("shippingCombine", e.target.value as "highest" | "sum")}><option value="highest">Charge once (the highest charge)</option><option value="sum">Add up every item&apos;s charge</option></select>
              </Field>
              {days("dispatchDays", "You pack and send within", "Working days after an order comes in. Not shown to customers; it's used to work out their delivery date.")}
              <div />
              {days("deliveryDaysMin", "Customers are told it arrives in, fastest", "Days from ordering, packing included. Shown as “delivered in 3–5 days”.")}
              {days("deliveryDaysMax", "…and slowest")}
            </div>
            <p className="mt-3 text-sm text-ink-soft">Free delivery above an amount is set in <a className="font-medium underline" href="/admin/discounts">Discounts</a>.</p>
          </Panel>

          <Panel title="Delhivery shipping">
            <p className="mb-3 text-sm text-ink-soft">Used to book shipments, print labels and show customers their delivery date. Copy the pickup address name exactly as it appears in Delhivery One under <b>Settings → Pickup locations</b>.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {text("delhiveryPickupName", "Pickup address name in Delhivery One", "Must match Delhivery One exactly, including spaces.", "e.g. WonderVastra Warehouse")}
              {text("delhiveryPickupPin", "Pincode of that pickup address", "Delivery dates are worked out from here.", "e.g. 110016")}
              <Field id="delhiveryPieceGrams" label="Weight of one piece" hint="Used for the parcel weight. A set is 2 pieces."><div className="flex items-center gap-2"><input id="delhiveryPieceGrams" className="input w-24" type="number" inputMode="numeric" min="10" value={s.delhiveryPieceGrams} onChange={(e) => up("delhiveryPieceGrams", Number(e.target.value))} /><span className="text-sm text-ink-soft">grams</span></div></Field>
              {text("delhiveryBox", "Usual box size (cm)", "Length x width x height.", "30x25x5")}
            </div>
          </Panel>

          <Panel title="Cash on delivery">
            {toggle("codEnabled", "Let customers pay cash when the parcel arrives")}
            {s.codEnabled && <div className="mt-3 grid gap-4 sm:grid-cols-2">{rupees("codFee", "Extra charge for cash on delivery", "Added to the order total. Put 0 for no extra charge.")}{rupees("codMaxOrder", "Allow cash on delivery for orders up to", "Bigger orders must be paid online.")}</div>}
          </Panel>

          <Panel title="Returns">
            {days("returnWindowDays", "Customers can return within", "Days after delivery. Put 0 if you don't take returns.")}
          </Panel>

          <Panel title="Seasonal look">
            {toggle("winterLook", "Winter look: light snowfall on the home banner, snowflakes in the top banner")}
            <p className="mt-2 text-xs text-ink-soft">Turn it off when winter is over. It's light and switches itself off for visitors who prefer less motion.</p>
          </Panel>

          <Panel title="Shop name and top banner">
            <div className="grid gap-4 sm:grid-cols-2">
              {text("storeName", "Shop name")}
              {text("tagline", "One line about your shop", "Shown in the footer.")}
              {text("announcement", "Message in the strip at the very top", "Leave empty to show your current sale and offers automatically.", "e.g. Diwali offers are live!", true)}
            </div>
          </Panel>

          <Panel title="Business details (for GST bills)">
            <p className="mb-3 text-sm text-ink-soft">Printed on invoices. Fill these when your GST registration is ready; leave empty until then.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {text("legalName", "Registered business name", "As on your GST certificate.")}
              {text("gstin", "GSTIN (if registered)", "15 characters, e.g. 07ABCDE1234F1Z5.")}
              <Field id="bstate" label="State you're registered in" hint="Decides CGST + SGST or IGST on each bill."><select id="bstate" className="input w-full min-w-0 truncate" value={s.businessState} onChange={(e) => up("businessState", e.target.value)}><option value="">Choose state</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field id="ba" label="Business address" wide><textarea id="ba" className="input" rows={2} value={s.businessAddress} onChange={(e) => up("businessAddress", e.target.value)} /></Field>
            </div>
          </Panel>

          <Panel title="Messages and alerts">
            <div className="space-y-2">{toggle("orderFeedbackEnabled", "After an order, ask the customer how ordering went")}{toggle("deliveryFeedbackEnabled", "After delivery, ask for a rating and review")}</div>
            <div className="mt-4">{text("adminAlertEmail", "Email me when a new order comes in", "Your own email address. Leave empty for no emails.", "you@gmail.com")}</div>
            <div className="mt-3">{toggle("dailySummary", "Also send me a summary every morning at 9 am: orders to pack, pickups, returns, stock running out, yesterday's visitors and sales, and the Delhivery wallet")}<SummaryNow /></div>
            <div className="mt-4">{text("orderCopyEmail", "Also send a copy of each new order to", "Another email that gets the same new-order email, once payment succeeds. Leave empty for none.", "partner@gmail.com")}</div>
          </Panel>

          {!isOwner && <p className="text-sm text-ink-soft">Only the owner can change settings.</p>}
        </fieldset>
        {isOwner && (
          <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,.06)] lg:left-60 ${dirty || busy ? "" : "hidden"}`}>
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">You have changes that aren&apos;t saved yet.</p>
              <div className="flex gap-2">
                <button type="button" className="btn btn-white btn-sm" disabled={busy} onClick={() => { setS(saved); setMsg(null); }}>Undo changes</button>
                <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
              </div>
            </div>
          </div>
        )}
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
