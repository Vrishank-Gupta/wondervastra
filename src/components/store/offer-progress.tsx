"use client";
import Link from "next/link";
import { ArrowRight, Check, PartyPopper, ShoppingBag } from "lucide-react";
import type { Quote } from "@/lib/pricing";
import { money } from "@/lib/format";
import { useCart } from "./cart-context";

/**
 * "Add ₹120 more to get 10% off", over a stepped bar with every reward on it, so a buyer can see the
 * whole ladder (₹500 → 5%, ₹1,000 → 8% …) and how close the next step is.
 */
export function OfferProgress({ quote }: { quote: Quote }) {
  const { setDrawerOpen } = useCart();
  const n = quote.nextOffer;
  const tiers = quote.tiers ?? [];
  const nextReward = n ? (n.type === "free_shipping" ? "free delivery" : n.type === "percent" ? `an extra ${n.value}% off` : `an extra ${money(n.value)} off`) : "";
  const unlocked = quote.offer ? `${quote.offer.name}: you save ${money(quote.offer.discount)}` : null;

  if (!n && !tiers.length) {
    if (!quote.offer && !quote.shippingNote) return null;
    return (
      <p className="flex items-center gap-2 bg-pine-soft px-3 py-2.5 text-sm font-semibold text-pine">
        <PartyPopper size={16} aria-hidden /> {quote.offer ? `${quote.offer.name} unlocked` : quote.shippingNote}
      </p>
    );
  }
  return (
    <div className="space-y-2.5 bg-sand-soft px-3 py-3" data-testid="offer-progress">
      {unlocked && <p className="flex items-center gap-2 text-sm font-semibold text-pine"><PartyPopper size={16} aria-hidden className="shrink-0" /> {unlocked}</p>}
      {n ? (
        <p className="flex items-center gap-2 text-sm"><ShoppingBag size={16} aria-hidden className="shrink-0" /><span>{n.piecesLeft > 0
          ? <>Add <b>{n.piecesLeft} more {n.piecesLeft === 1 ? "piece" : "pieces"}</b> to get <b>{nextReward}</b></>
          : <>Add <b>{money(n.remaining)}</b> more to get <b>{nextReward}</b></>}</span></p>
      ) : null}
      {n ? (
        <Link href="/shop" onClick={() => setDrawerOpen(false)} className="btn btn-white btn-sm w-full" data-testid="add-more">Add more items <ArrowRight size={15} aria-hidden /></Link>
      ) : !unlocked && quote.shippingNote ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-pine"><PartyPopper size={16} aria-hidden /> {quote.shippingNote}</p>
      ) : !unlocked ? null : <p className="text-xs text-ink-soft">You&apos;ve unlocked the best cart offer.</p>}
      {tiers.length > 0 && (
        <ol className="flex items-start" aria-label="Cart rewards">
          {tiers.map((t, i) => {
            // Piece steps fill by pieces, cart-value steps by rupees.
            const byPieces = t.minPieces > 0;
            const prev = i ? (byPieces ? tiers[i - 1].minPieces : tiers[i - 1].minSubtotal) : 0;
            const have = byPieces ? quote.pieces : quote.subtotal;
            const fill = t.reached ? 1 : Math.max(0, Math.min(1, (have - prev) / Math.max(1, (byPieces ? t.minPieces : t.minSubtotal) - prev)));
            return (
              <li key={`${t.minPieces}-${t.minSubtotal}-${t.reward}`} className="flex min-w-0 flex-1 flex-col items-end">
                <div className="flex w-full items-center">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full bg-madder transition-all" style={{ width: `${fill * 100}%` }} /></span>
                  <span className={`-ml-0.5 grid size-4 shrink-0 place-items-center rounded-full ${t.reached ? "bg-madder text-white" : "border-2 border-line bg-white"}`}>{t.reached && <Check size={10} strokeWidth={3} aria-hidden />}</span>
                </div>
                <span className={`mt-1 w-full text-right text-[11px] leading-tight break-words ${t.reached ? "font-bold text-madder" : "text-ink-soft"}`} title={`${t.label}: ${t.reward}`}>
                  <span className="sr-only">{t.reached ? "Unlocked: " : ""}</span>{t.reward.replace(/ \(up to .*\)$/, "")}<span className="block font-normal">{t.minPieces ? `${t.minPieces} pieces` : money(t.minSubtotal)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
