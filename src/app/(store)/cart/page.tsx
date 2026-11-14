"use client";
import Image from "next/image";
import Link from "next/link";
import { ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/components/store/cart-context";
import { QtyStepper } from "@/components/store/cart-drawer";
import { OfferProgress } from "@/components/store/offer-progress";
import { CartDeliveryNote } from "@/components/store/delivery-check";
import { CouponBox, PriceSummary } from "@/components/store/price-summary";
import { useQuote } from "@/components/store/use-quote";
import { money } from "@/lib/format";

export default function CartPage() {
  const { items, ready, setQty, remove, coupon } = useCart();
  const { quote } = useQuote(items, { coupon, enabled: ready });
  if (ready && !items.length) {
    return (
      <div className="container-x flex flex-col items-center gap-3 py-20 text-center">
        <ShoppingBag size={48} aria-hidden />
        <h1 className="text-3xl">Your cart is empty</h1>
        <Link href="/shop" className="btn btn-primary">Continue shopping</Link>
      </div>
    );
  }
  return (
    <div className="container-x py-6">
      <h1 className="mb-5 text-4xl">Your cart</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-3">
          {quote && <OfferProgress quote={quote} />}
          <CartDeliveryNote />
          {quote?.views.map((l) => (
            <div key={l.variantId} className="flex gap-3 rounded-sm border border-line bg-white p-3">
              <Link href={`/p/${l.slug}`} className="relative h-28 w-24 shrink-0 overflow-hidden rounded-sm border border-line">{l.image && <Image src={l.image} alt="" fill sizes="96px" className="object-cover" />}</Link>
              <div className="min-w-0 flex-1">
                <Link href={`/p/${l.slug}`} className="font-medium hover:underline">{l.name}</Link>
                <p className="text-sm text-ink-soft">{l.variantLabel}</p>
                <p className="text-xs font-medium">{l.deliveryMode === "free" ? <span className="text-pine">Free delivery</span> : `Delivery ${money(l.deliveryCharge)}`}</p>
                {l.issue && <p className="mt-1 text-sm font-medium text-clay">{l.issue}</p>}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {l.qty > 0 ? <QtyStepper qty={l.qty} max={l.maxQty} label={l.name} onChange={(n) => setQty(l.variantId, n)} /> : <span />}
                  <div className="flex items-center gap-2">
                    {l.qty > 0 && <span className="font-semibold">{money(l.lineTotal)}</span>}
                    <button aria-label={`Remove ${l.name}`} className="grid size-10 place-items-center text-ink-soft hover:text-clay" onClick={() => remove(l.variantId)}><Trash2 size={18} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="card-pop space-y-4 p-4">
            <CouponBox quote={quote} />
            {quote && <PriceSummary quote={quote} />}
            <Link href="/checkout" className="btn btn-primary w-full text-lg">Proceed to checkout</Link>
            <p className="text-center text-xs text-ink-soft">No account needed · Track your order anytime</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
