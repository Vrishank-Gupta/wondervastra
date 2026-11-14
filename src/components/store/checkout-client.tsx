"use client";
import { STATES } from "@/lib/states";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { AlertTriangle, Banknote, CreditCard, Loader2, Lock, MapPin, ShoppingBag } from "lucide-react";
import { money } from "@/lib/format";
import { useCart } from "./cart-context";
import { OfferProgress } from "./offer-progress";
import { CouponBox, PriceSummary } from "./price-summary";
import { useQuote } from "./use-quote";
import { AreaWaitlist, lookupPin, rememberPin, savedPin, type PinResult } from "./delivery-check";

type Addr = { id: string; name: string; phone: string; line1: string; line2: string | null; city: string; state: string; pincode: string };
type Props = {
  customer: { name: string | null; email: string | null; phone: string | null } | null;
  addresses: Addr[]; online: boolean; simulated: boolean; live: boolean; codFee: number; deliveryArea: string;
};
declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void } } }


export function CheckoutClient({ customer, addresses, online, simulated, codFee, deliveryArea }: Props) {
  const { items, ready, coupon, clear, setCoupon, attribution } = useCart();
  const [email, setEmail] = useState(customer?.email ?? "");
  const [name, setName] = useState(customer?.name ?? addresses[0]?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? addresses[0]?.phone ?? "");
  const [line1, setLine1] = useState(addresses[0]?.line1 ?? "");
  const [line2, setLine2] = useState(addresses[0]?.line2 ?? "");
  const [city, setCity] = useState(addresses[0]?.city ?? "");
  const [state, setState] = useState(addresses[0]?.state ?? "");
  const [pincode, setPincode] = useState(addresses[0]?.pincode ?? "");
  const [note, setNote] = useState("");
  const [optIn, setOptIn] = useState(true);
  const [saveAddr, setSaveAddr] = useState(true);
  const [method, setMethod] = useState<"razorpay" | "cod">(online ? "razorpay" : "cod");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pinNote, setPinNote] = useState("");
  const [area, setArea] = useState<PinResult | null>(null);

  const { quote } = useQuote(items, { coupon, paymentMethod: method, email, phone, enabled: ready });

  useEffect(() => {
    if (quote && !quote.codAvailable && method === "cod" && online) setMethod("razorpay");
  }, [quote, method, online]);

  // A buyer who already checked their pincode on a product page doesn't type it twice.
  useEffect(() => { if (!addresses.length) setPincode((p) => p || savedPin()); }, [addresses.length]);

  // Pincode: tells the buyer straight away whether we deliver there, and fills city and state.
  useEffect(() => {
    if (!/^[1-9]\d{5}$/.test(pincode)) { setPinNote(""); setArea(null); return; }
    let live = true;
    lookupPin(pincode).then((d) => {
      if (!live || !d) return;
      setArea(d);
      if (d.serviceable) rememberPin(pincode);
      const town = d.place ?? d.city;
      if (!town) { setPinNote(""); return; }
      setCity((c) => c || town);
      if (d.state && STATES.includes(d.state)) setState((s) => s || d.state!);
      setPinNote(d.state ? `${town}, ${d.state}` : town);
    });
    return () => { live = false; };
  }, [pincode]);
  const outside = Boolean(area && area.pincode === pincode && !area.serviceable);

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!quote) return;
    if (outside) { setError(`We don't deliver to ${pincode} yet. Please use an address in ${deliveryArea}.`); document.getElementById("pincode")?.focus(); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: quote.views.filter((v) => v.qty > 0).map((v) => ({ variantId: v.variantId, qty: v.qty })),
          couponCode: quote.coupon?.code ?? null, paymentMethod: method, expectedTotal: quote.total,
          name, email, phone, line1, line2, city, state, pincode, customerNote: note, whatsappOptIn: optIn, saveAddress: saveAddr,
          utmSource: attribution.utmSource, utmCampaign: attribution.utmCampaign,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't place your order. Please try again.");

      const finish = () => { clear(); setCoupon(""); window.location.href = `/order/${json.accessToken}?placed=1`; };
      if (method === "cod") return finish();

      if (json.simulated) {
        const v = await fetch("/api/checkout/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: json.id, simulate: true }) });
        if (!v.ok) throw new Error("Simulated payment failed.");
        return finish();
      }
      if (!window.Razorpay) throw new Error("Payment window couldn't load. Check your connection and try again.");
      const rzp = new window.Razorpay({
        key: json.keyId, amount: json.total, currency: "INR", name: "WonderVastra", description: `Order ${json.number}`, order_id: json.razorpayOrderId,
        prefill: { name, email, contact: phone }, theme: { color: "#7A1F35" },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const v = await fetch("/api/checkout/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: json.id, ...r }) });
          // If verify hiccups the webhook still confirms it, so the order page is always the right place to land.
          void v;
          finish();
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError("Payment was cancelled. Your items are still in your cart.");
            fetch("/api/checkout/abandon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: json.accessToken }) }).catch(() => {});
          },
        },
      });
      rzp.on("payment.failed", () => setError("That payment didn't go through. You can try again or pick another method."));
      rzp.open();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (ready && !items.length) {
    return (
      <div className="container-x flex flex-col items-center gap-3 py-20 text-center">
        <ShoppingBag size={48} aria-hidden />
        <h1 className="text-3xl">Nothing to check out yet</h1>
        <Link href="/shop" className="btn btn-primary">Browse products</Link>
      </div>
    );
  }
  const hasIssue = quote?.views.some((v) => v.issue);
  const pieces = quote?.views.reduce((a, v) => a + v.qty, 0) ?? 0;
  const itemList = (
    <ul className="space-y-2.5">
              {quote?.views.map((l) => (
                <li key={l.variantId} className="flex gap-2.5">
                  <span className="relative h-16 w-13 shrink-0 overflow-hidden rounded-sm border border-line">{l.image && <Image src={l.image} alt="" fill sizes="52px" className="object-cover" />}</span>
                  <span className="min-w-0 flex-1 text-sm"><b className="line-clamp-1">{l.name}</b><span className="block text-xs text-ink-soft">{l.variantLabel} × {l.qty}</span>{l.issue && <span className="block text-xs font-medium text-clay">{l.issue}</span>}</span>
                  <b className="text-sm">{money(l.lineTotal)}</b>
                </li>
              ))}
            </ul>
  );
  const nothing = quote && !quote.views.some((v) => v.qty > 0);

  return (
    <div className="container-x py-6">
      {online && !simulated && <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />}
      <h1 className="mb-1 text-4xl">Checkout</h1>
      {!customer && <p className="mb-5 text-sm text-ink-soft">Checking out as a guest. <Link href="/login?next=/checkout" className="font-medium underline">Log in</Link> to use saved addresses.</p>}
      {simulated && (
        <p className="mb-4 flex items-start gap-2 rounded-sm border border-line bg-sand-soft p-3 text-sm font-medium"><AlertTriangle size={18} aria-hidden className="shrink-0" /> Test mode: Razorpay keys aren&apos;t set, so online payment is simulated and no money moves.</p>
      )}
      <form onSubmit={placeOrder} className="grid gap-6 pb-24 lg:grid-cols-[1fr_24rem] lg:pb-0">
        <div className="space-y-5">
          {/* On phones the full summary sits below the form, so what's being bought is one tap away at the top. */}
          {quote && (
            <details className="group card lg:hidden" data-testid="mobile-summary">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag size={18} aria-hidden /> Order summary · {pieces} {pieces === 1 ? "item" : "items"}<span className="font-normal text-ink-soft underline group-open:hidden">Show</span><span className="hidden font-normal text-ink-soft underline group-open:inline">Hide</span></span>
                <b className="text-lg">{money(quote.total)}</b>
              </summary>
              <div className="space-y-3 border-t border-line p-4">
                {itemList}
                {quote.totalSavings > 0 && <p className="text-sm font-semibold text-pine">You save {money(quote.totalSavings)} on this order</p>}
                <p className="text-xs text-ink-soft">Coupon code and full price breakdown are at the bottom, above the Pay button.</p>
              </div>
            </details>
          )}
          <section className="card p-4 sm:p-5">
            <h2 className="mb-3 text-xl">Contact</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="phone">WhatsApp number</label><input id="phone" className="input" type="tel" inputMode="numeric" autoComplete="tel-national" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" /></div>
              <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" /></div>
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-ink" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} /> Send me order updates and tracking links on WhatsApp</label>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="mb-1 flex items-center gap-2 text-xl"><MapPin size={20} aria-hidden />Delivery address</h2>
            {deliveryArea !== "India" && <p className="mb-3 text-sm text-ink-soft">We deliver across {deliveryArea} for now.</p>}
            {addresses.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {addresses.map((a) => (
                  <button type="button" key={a.id} className={`rounded-sm border px-3 py-2 text-left text-xs ${line1 === a.line1 && pincode === a.pincode ? "border-ink bg-sand-soft" : "border-line"}`} onClick={() => {
                    setName(a.name); setPhone(a.phone); setLine1(a.line1); setLine2(a.line2 ?? ""); setCity(a.city); setState(a.state); setPincode(a.pincode);
                  }}><b>{a.name}</b><br />{a.line1}, {a.city}</button>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label" htmlFor="name">Full name</label><input id="name" className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="line1">House no, building, street</label><input id="line1" className="input" autoComplete="address-line1" required value={line1} onChange={(e) => setLine1(e.target.value)} /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="line2">Area, landmark <span className="font-normal text-ink-soft">(optional)</span></label><input id="line2" className="input" autoComplete="address-line2" value={line2} onChange={(e) => setLine2(e.target.value)} /></div>
              <div><label className="label" htmlFor="pincode">Pincode</label><input id="pincode" className="input" inputMode="numeric" autoComplete="postal-code" maxLength={6} required pattern="[1-9][0-9]{5}" title="6-digit pincode" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} aria-invalid={outside || undefined} aria-describedby={outside ? "pin-outside" : undefined} />{pinNote && !outside && <p className="mt-1 text-xs font-medium text-pine">{pinNote} · we deliver here</p>}</div>
              <div><label className="label" htmlFor="city">City</label><input id="city" className="input" autoComplete="address-level2" required value={city} onChange={(e) => setCity(e.target.value)} /></div>
              {outside && area && (
                <div id="pin-outside" className="space-y-2 rounded-sm border border-clay bg-clay-soft p-3 sm:col-span-2" role="alert">
                  <p className="text-sm"><b>Sorry, we don&apos;t deliver to {area.place ? `${area.place} ` : ""}{area.pincode} yet.</b> We deliver only in {area.area} for now. Use a {area.area} address, or leave your number and we&apos;ll tell you when we reach you.</p>
                  <AreaWaitlist pincode={area.pincode} place={area.place} defaultContact={phone || email} compact />
                </div>
              )}
              <div className="sm:col-span-2"><label className="label" htmlFor="state">State</label>
                <select id="state" className="input" autoComplete="address-level1" required value={state} onChange={(e) => setState(e.target.value)}>
                  <option value="">Select state</option>{STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2"><label className="label" htmlFor="note">Order note <span className="font-normal text-ink-soft">(optional)</span></label><input id="note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Gift message, delivery instructions…" /></div>
            </div>
            {customer && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} /> Save this address for next time</label>}
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="mb-3 text-xl">Payment</h2>
            <div className="space-y-2">
              {online && (
                <label className={`flex cursor-pointer items-center gap-3 rounded-sm border p-3 ${method === "razorpay" ? "border-ink bg-sand-soft" : "border-line"}`}>
                  <input type="radio" name="pay" className="size-4 accent-ink" checked={method === "razorpay"} onChange={() => setMethod("razorpay")} />
                  <CreditCard size={20} aria-hidden /><span><b>Pay online</b><span className="block text-xs text-ink-soft">UPI, cards, netbanking, wallets via Razorpay</span></span>
                </label>
              )}
              <label className={`flex items-center gap-3 rounded-sm border p-3 ${quote && !quote.codAvailable ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${method === "cod" ? "border-ink bg-sand-soft" : "border-line"}`}>
                <input type="radio" name="pay" className="size-4 accent-ink" disabled={Boolean(quote && !quote.codAvailable)} checked={method === "cod"} onChange={() => setMethod("cod")} />
                <Banknote size={20} aria-hidden /><span><b>Cash on delivery</b><span className="block text-xs text-ink-soft">{quote && !quote.codAvailable ? quote.codReason : codFee ? `${money(codFee)} handling fee` : "Pay when it arrives"}</span></span>
              </label>
              {!online && quote && !quote.codAvailable && <p className="text-sm font-medium text-clay" role="alert">Online payment isn&apos;t available right now. Please contact us to order.</p>}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="card-pop space-y-4 p-4">
            <h2 className="text-xl">Order summary</h2>
            {quote && <OfferProgress quote={quote} />}
            {itemList}
            <CouponBox quote={quote} />
            {quote && <PriceSummary quote={quote} />}
            {error && <p className="rounded-sm border border-clay bg-clay-soft p-3 text-sm font-medium" role="alert">{error}</p>}
            {hasIssue && <p className="text-sm font-medium text-clay">Some items changed. <Link className="underline" href="/cart">Review your cart</Link>.</p>}
            <button disabled={busy || !quote || Boolean(nothing)} className="btn btn-primary hidden w-full text-lg lg:flex">
              {busy ? <Loader2 className="animate-spin" size={18} aria-hidden /> : <Lock size={16} aria-hidden />}
              {method === "cod" ? "Place order" : `Pay ${quote ? money(quote.total) : ""}`}
            </button>
            <p className="text-center text-xs text-ink-soft">By ordering you agree to our <Link className="underline" href="/info/terms">terms</Link> and <Link className="underline" href="/info/returns-policy">returns policy</Link>.</p>
          </div>
        </aside>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] lg:hidden">
          <button disabled={busy || !quote || Boolean(nothing)} className="btn btn-primary w-full text-lg">
            {busy ? <Loader2 className="animate-spin" size={18} aria-hidden /> : <Lock size={16} aria-hidden />}
            {method === "cod" ? `Place order · ${quote ? money(quote.total) : ""}` : `Pay ${quote ? money(quote.total) : ""}`}
          </button>
        </div>
      </form>
    </div>
  );
}
