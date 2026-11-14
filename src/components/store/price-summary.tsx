"use client";
import { useEffect, useState } from "react";
import { Check, Tag, X } from "lucide-react";
import type { Quote } from "@/lib/pricing";
import { money } from "@/lib/format";
import { useCart } from "./cart-context";

export function CouponBox({ quote }: { quote: Quote | null }) {
  const { coupon, setCoupon } = useCart();
  const [text, setText] = useState(coupon);
  useEffect(() => setText(coupon), [coupon]);
  const applied = quote?.coupon?.code === coupon && coupon;
  return (
    <div>
      {applied ? (
        <div className="flex items-center justify-between rounded-sm bg-pine-soft px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold"><Check size={16} aria-hidden /> {coupon} applied</span>
          <button aria-label="Remove coupon" onClick={() => setCoupon("")} className="grid size-8 place-items-center"><X size={16} /></button>
        </div>
      ) : (
        // Not a <form>: this sits inside the checkout form, and Enter here must never place the order.
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Tag size={16} aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft" />
            <input
              aria-label="Coupon code" value={text} placeholder="Coupon code" className="input pl-9 uppercase"
              onChange={(e) => setText(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setCoupon(text.trim().toUpperCase()); } }}
            />
          </div>
          <button type="button" className="btn btn-ink shrink-0 px-4" onClick={() => setCoupon(text.trim().toUpperCase())}>Apply</button>
        </div>
      )}
      {coupon && quote?.couponError && <p className="mt-1.5 text-sm font-medium text-clay" role="alert">{quote.couponError}</p>}
    </div>
  );
}

export function PriceSummary({ quote }: { quote: Quote }) {
  const row = "flex justify-between gap-3 text-sm";
  return (
    <dl className="space-y-2">
      {quote.mrpTotal > quote.subtotal && <div className={row}><dt>Items at MRP</dt><dd><s>{money(quote.mrpTotal)}</s></dd></div>}
      <div className={row}><dt>Subtotal</dt><dd className="font-medium">{money(quote.subtotal)}</dd></div>
      {quote.offer && <div className={`${row} text-pine`}><dt>{quote.offer.name}</dt><dd className="font-medium">−{money(quote.offer.discount)}</dd></div>}
      {quote.coupon && quote.coupon.discount > 0 && <div className={`${row} text-pine`}><dt>Coupon {quote.coupon.code}</dt><dd className="font-medium">−{money(quote.coupon.discount)}</dd></div>}
      <div className={row}><dt>Delivery{quote.shipping === 0 && quote.shippingNote ? <span className="block text-xs text-pine">{quote.shippingNote}</span> : null}</dt><dd className="font-medium">{quote.shipping === 0 ? "FREE" : money(quote.shipping)}</dd></div>
      {quote.codFee > 0 && <div className={row}><dt>Cash on delivery fee</dt><dd className="font-medium">{money(quote.codFee)}</dd></div>}
      <div className="flex justify-between gap-3 border-t border-ink pt-3 text-lg font-medium"><dt>Total</dt><dd>{money(quote.total)}</dd></div>
      {quote.totalSavings > 0 && <p className="pt-1 text-center text-sm text-pine">You&apos;re saving {money(quote.totalSavings)} on this order</p>}
    </dl>
  );
}
