import { PartyPopper, Truck } from "lucide-react";
import type { Quote } from "@/lib/pricing";
import { money } from "@/lib/format";

/** "Add ₹120 more for free delivery". The nudge that lifts average order value. */
export function OfferProgress({ quote }: { quote: Quote }) {
  const n = quote.nextOffer;
  if (!n && quote.shipping > 0) return null;
  if (!n) {
    if (!quote.offer && !quote.shippingNote) return null;
    return (
      <p className="flex items-center gap-2 bg-pine-soft px-3 py-2.5 text-sm font-semibold text-pine">
        <PartyPopper size={16} aria-hidden /> {quote.offer ? `${quote.offer.name} unlocked` : quote.shippingNote}
      </p>
    );
  }
  const pct = Math.min(100, Math.round((quote.subtotal / n.minSubtotal) * 100));
  const reward = n.type === "free_shipping" ? "free delivery" : n.type === "percent" ? `${n.value}% off` : `${money(n.value)} off`;
  return (
    <div className="bg-sand-soft px-3 py-2.5">
      <p className="flex items-center gap-2 text-sm"><Truck size={16} aria-hidden /> Add <b>{money(n.remaining)}</b> more for <b>{reward}</b></p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-madder transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
