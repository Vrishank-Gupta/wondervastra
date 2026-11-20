import Link from "next/link";
import { money } from "@/lib/format";
import type { PromoBar } from "@/lib/promo";
import { Countdown } from "./countdown";

const r = (p: number) => money(p).replace(/\.00$/, "");

/** The campaign band inside the sticky header on every store page, so the countdown stays in view while scrolling. */
export function PromoRibbon({ promo }: { promo: PromoBar }) {
  // On the home and sale pages it appears once the shopper scrolls past the banner's own countdown.
  return (
    <Link href="/sale" className="block bg-gradient-to-r from-[#FFC83A] via-[#FFB21A] to-[#FF9A1A] text-[#4A1420] no-print" aria-label={`${promo.name} sale is live. Shop the sale`}>
      <div className="container-x flex items-center justify-between gap-x-3 py-1.5 sm:py-2">
        <p className="flex min-w-0 items-center gap-2 font-display text-lg leading-none tracking-wide uppercase sm:text-2xl">
          <span className="wv-flash size-2.5 shrink-0 rounded-full bg-[#E3202A]" aria-hidden /><span className="truncate">{promo.name}</span><span className="hidden bg-[#4A1420] px-2 py-1 text-[11px] font-bold tracking-[0.12em] text-white sm:inline">Sale is live</span>
        </p>
        <p className="hidden text-sm font-bold lg:block">
          {[promo.kidsFrom && `Kids' sets from ${r(promo.kidsFrom)}`, promo.menFrom && `Men's from ${r(promo.menFrom)}`, promo.extra && `+ up to ${promo.extra} extra off`].filter(Boolean).join(" · ")}
        </p>
        <div className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase">
          <span className="hidden xl:inline">Hurry, ends in</span>
          <span className="bg-[#E3202A] px-2 py-1 text-white tabular-nums"><Countdown endsAt={promo.endsAt} compact /></span>
          <span className="hidden underline underline-offset-4 sm:inline">Shop now</span><span className="sm:hidden" aria-hidden>→</span>
        </div>
      </div>
    </Link>
  );
}
