"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { money } from "@/lib/format";
import { useCart } from "./cart-context";
import { OfferProgress } from "./offer-progress";
import { CartDeliveryNote } from "./delivery-check";
import { useQuote } from "./use-quote";

export function QtyStepper({ qty, max, onChange, label }: { qty: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="inline-flex items-center rounded-xs border border-line" role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" className="grid size-9 place-items-center disabled:opacity-30" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => onChange(qty - 1)}><Minus size={16} /></button>
      <span className="w-7 text-center text-sm font-medium" aria-live="polite">{qty}</span>
      <button type="button" className="grid size-9 place-items-center disabled:opacity-30" aria-label="Increase quantity" disabled={qty >= max} onClick={() => onChange(qty + 1)}><Plus size={16} /></button>
    </div>
  );
}

export function CartDrawer() {
  const { items, drawerOpen, setDrawerOpen, setQty, remove, coupon } = useCart();
  const { quote } = useQuote(items, { coupon, enabled: drawerOpen });

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [drawerOpen, setDrawerOpen]);

  if (!drawerOpen) return null;
  return (
    <div className="fixed inset-0 z-50 no-print" role="dialog" aria-modal="true" aria-label="Your cart">
      <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} />
      <aside className="slide-in absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-ivory">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-xl">Your cart</h2>
          <button aria-label="Close cart" className="-mr-2 grid size-10 place-items-center" onClick={() => setDrawerOpen(false)}><X size={18} /></button>
        </header>
        {!items.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <ShoppingBag size={36} strokeWidth={1.25} aria-hidden />
            <p className="font-display text-2xl">Your cart is empty</p>
            <Link href="/shop" className="btn btn-primary" onClick={() => setDrawerOpen(false)}>Start shopping</Link>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {quote && <OfferProgress quote={quote} />}
              <CartDeliveryNote />
              {quote?.views.map((l) => (
                <div key={l.variantId} className="flex gap-3 border-b border-line pb-3">
                  <Link href={`/p/${l.slug}`} onClick={() => setDrawerOpen(false)} className="relative h-24 w-20 shrink-0 overflow-hidden bg-sand-soft">
                    {l.image && <Image src={l.image} alt="" fill sizes="80px" className="object-cover" />}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm leading-tight font-medium">{l.name}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{l.variantLabel}</p>
                    {l.issue && <p className="mt-1 text-xs font-medium text-clay">{l.issue}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {l.qty > 0 ? <QtyStepper qty={l.qty} max={l.maxQty} label={l.name} onChange={(n) => setQty(l.variantId, n)} /> : <span />}
                      <div className="flex items-center gap-1">
                        {l.qty > 0 && <span className="text-sm font-semibold">{money(l.lineTotal)}</span>}
                        <button aria-label={`Remove ${l.name}`} className="grid size-9 place-items-center text-ink-soft hover:text-clay" onClick={() => remove(l.variantId)}><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!quote && <div className="h-28 animate-pulse rounded-sm bg-white/70" />}
            </div>
            <footer className="space-y-2 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {quote && (
                <>
                  <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-medium">{money(quote.subtotal)}</span></div>
                  {quote.offer && <div className="flex justify-between text-sm text-pine"><span>{quote.offer.name}</span><span className="font-medium">−{money(quote.offer.discount)}</span></div>}
                  {quote.coupon && quote.coupon.discount > 0 && <div className="flex justify-between text-sm text-pine"><span>Coupon {quote.coupon.code}</span><span className="font-medium">−{money(quote.coupon.discount)}</span></div>}
                  <div className="flex justify-between text-sm"><span>Delivery</span><span className="font-medium">{quote.shipping === 0 ? "FREE" : money(quote.shipping)}</span></div>
                  <div className="flex justify-between border-t border-line pt-2 text-base font-medium"><span>Total</span><span>{money(quote.total)}</span></div>
                  {quote.totalSavings > 0 && <p className="text-center text-sm text-pine">You&apos;re saving {money(quote.totalSavings)}</p>}
                </>
              )}
              {quote?.minimumIssue
                ? <p role="alert" data-testid="minimum-issue" className="rounded-sm bg-clay-soft p-2.5 text-sm font-medium">{quote.minimumIssue}</p>
                : <Link href="/checkout" onClick={() => setDrawerOpen(false)} className="btn btn-primary w-full">Checkout</Link>}
              <Link href="/cart" onClick={() => setDrawerOpen(false)} className="block py-1 text-center text-sm font-medium underline">View full cart</Link>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
