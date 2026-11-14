"use client";
import { useCallback, useEffect, useState } from "react";
import { Bell, Check, Loader2, MapPin, X } from "lucide-react";

export type PinResult = { pincode: string; serviceable: boolean; area: string; place: string | null; city: string | null; state: string | null };

const KEY = "wv-pin";
const EVENT = "wv-pin-change";
export function savedPin(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}
export function rememberPin(pin: string) {
  try { localStorage.setItem(KEY, pin); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pin }));
}

const cache = new Map<string, Promise<PinResult | null>>();
export function lookupPin(pin: string): Promise<PinResult | null> {
  if (!/^[1-9]\d{5}$/.test(pin)) return Promise.resolve(null);
  if (!cache.has(pin)) cache.set(pin, fetch(`/api/pincode/${pin}`).then((r) => (r.ok ? r.json() : null)).catch(() => { cache.delete(pin); return null; }));
  return cache.get(pin)!;
}

/** The buyer's pincode, remembered across pages and tabs, with the delivery answer for it. */
export function usePincode() {
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<PinResult | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    setPin(savedPin());
    const on = (e: Event) => setPin((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => {
    if (!/^[1-9]\d{5}$/.test(pin)) { setResult(null); return; }
    let live = true;
    setChecking(true);
    lookupPin(pin).then((r) => { if (live) { setResult(r); setChecking(false); } });
    return () => { live = false; };
  }, [pin]);
  const check = useCallback((p: string) => { rememberPin(p); setPin(p); }, []);
  return { pin, result, checking, check };
}

/** "Tell me when you deliver here": one field, email or WhatsApp number. */
export function AreaWaitlist({ pincode, place, defaultContact = "", compact = false }: { pincode: string; place?: string | null; defaultContact?: string; compact?: boolean }) {
  const [contact, setContact] = useState(defaultContact);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  useEffect(() => { setState("idle"); }, [pincode]);
  async function send() {
    if (!contact.trim()) { setError("Enter your WhatsApp number or email."); return; }
    setState("busy"); setError("");
    const res = await fetch("/api/area-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pincode, contact, place }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) setState("done"); else { setState("idle"); setError(json.error ?? "Couldn't save that. Please try again."); }
  }
  if (state === "done") return <p className="flex items-center gap-2 text-sm font-medium text-pine" role="status"><Check size={16} aria-hidden /> Done. We&apos;ll tell you as soon as we deliver to {pincode}.</p>;
  return (
    // Not a <form>: this also sits inside the checkout form, and forms can't nest.
    <div className="space-y-1.5" role="group" aria-label="Tell me when you deliver here">
      {!compact && <label htmlFor={`area-${pincode}`} className="block text-sm">Tell me when you deliver here:</label>}
      <div className="flex flex-wrap gap-2">
        <input id={`area-${pincode}`} aria-label="WhatsApp number or email" value={contact} onChange={(e) => setContact(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }} className="input min-w-0 flex-[1_1_11rem]" placeholder="WhatsApp number or email" />
        <button type="button" disabled={state === "busy"} onClick={() => void send()} className="btn btn-ink flex-[1_0_auto]"><Bell size={15} aria-hidden /> Notify me</button>
      </div>
      {error && <p className="text-sm font-medium text-clay" role="alert">{error}</p>}
    </div>
  );
}

/** Product page: check a pincode before buying. */
export function DeliveryCheck({ area, restricted, days }: { area: string; restricted: boolean; days: string }) {
  const { pin, result, checking, check } = usePincode();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => { setDraft(pin); }, [pin]);
  const failed = Boolean(pin) && !checking && !result;
  const showForm = editing || !pin || failed;
  return (
    <div className="mt-5 border border-line p-3" data-testid="delivery-check">
      <p className="flex items-center gap-2 text-[13px] font-bold tracking-[0.08em] uppercase"><MapPin size={16} aria-hidden /> Delivery</p>
      {showForm ? (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (/^[1-9]\d{5}$/.test(draft)) { check(draft); setEditing(false); } }}>
          <input aria-label="Your pincode" className="input" inputMode="numeric" autoComplete="postal-code" maxLength={6} pattern="[1-9][0-9]{5}" title="6-digit pincode" required placeholder="Enter your pincode" value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))} />
          <button className="btn btn-white shrink-0">Check</button>
        </form>
      ) : checking || !result ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft"><Loader2 size={15} className="animate-spin" aria-hidden /> Checking {pin}…</p>
      ) : (
        <div className="mt-2 space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-2">
            {result.serviceable
              ? <p className="flex items-start gap-2 text-sm"><Check size={17} aria-hidden className="mt-0.5 shrink-0 text-pine" /><span><b className="text-pine">We deliver to {result.place ? `${result.place} ` : ""}{result.pincode}</b><span className="block text-ink-soft">{days}</span></span></p>
              : <p className="flex items-start gap-2 text-sm"><X size={17} aria-hidden className="mt-0.5 shrink-0 text-clay" /><span><b>We don&apos;t deliver to {result.place ? `${result.place} ` : ""}{result.pincode} yet</b><span className="block text-ink-soft">We deliver only in {result.area} for now.</span></span></p>}
            <button type="button" className="text-sm font-medium underline" onClick={() => setEditing(true)}>Change</button>
          </div>
          {!result.serviceable && <AreaWaitlist pincode={result.pincode} place={result.place} compact />}
        </div>
      )}
      {failed && !editing && <p className="mt-2 text-xs font-medium text-clay" role="alert">Couldn&apos;t check {pin}. Please check the pincode and try again.</p>}
      {showForm && restricted && <p className="mt-2 text-xs text-ink-soft">We deliver across {area} for now.</p>}
    </div>
  );
}

/** One line in the cart: where we're delivering, or a heads-up before checkout if we can't. */
export function CartDeliveryNote() {
  const { result } = usePincode();
  if (!result) return null;
  return result.serviceable
    ? <p className="flex items-center gap-1.5 text-xs text-pine"><Check size={14} aria-hidden /> Delivering to {result.place ? `${result.place} ` : ""}{result.pincode}</p>
    : <p className="flex items-start gap-1.5 rounded-sm bg-clay-soft p-2 text-xs font-medium" role="status"><X size={14} aria-hidden className="mt-px shrink-0" /> We don&apos;t deliver to {result.pincode} yet, only {result.area}. You can use a {result.area} address at checkout.</p>;
}
