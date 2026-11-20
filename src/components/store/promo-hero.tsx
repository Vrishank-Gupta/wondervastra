import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Truck } from "lucide-react";
import type { ProductCard } from "@/lib/catalog";
import { money } from "@/lib/format";
import type { Promo } from "@/lib/promo";
import { brandPhrase } from "@/lib/seo";
import { withBrand } from "@/lib/utils";
import { Countdown } from "./countdown";

const MAROON = "#4A1420", RED = "#E3202A";
const r = (p: number) => money(p).replace(/\.00$/, "");

/**
 * The campaign banner, built in the style of the campaign poster but as real text: live prices, the
 * store's own product photos and a countdown, sharp at any width. (The poster image itself is kept for
 * link previews on WhatsApp and Instagram, where a single picture is what's wanted.)
 */
export function PromoHero({ promo, cards, extra, heading = "h2" }: { promo: Promo; cards: ProductCard[]; extra: string | null; heading?: "h1" | "h2" }) {
  const maxOff = Math.max(0, ...cards.filter((c) => c.inStock).map((c) => c.discountPct));
  const live = cards.filter((c) => c.inStock);
  const cheapest = (slug: string) => live.filter((c) => c.categorySlug === slug).sort((a, b) => a.price - b.price)[0] ?? null;
  const kids = cheapest("kids-thermals"), men = cheapest("mens-thermals");
  const brands = [...new Set(live.map((c) => c.brandName).filter(Boolean))] as string[];
  const H = heading;
  const [first, ...rest] = promo.name.split(" ");

  const priceCard = (label: string, p: ProductCard, motion: string) => (
    <Link href={`/p/${p.slug}`} className={`block bg-white px-4 py-3 ${motion}`} style={{ boxShadow: `5px 5px 0 ${MAROON}` }}>
      <span className="block text-[11px] font-extrabold tracking-[0.12em] uppercase sm:text-xs" style={{ color: MAROON }}>{label}</span>
      <span className="block font-display text-5xl leading-none sm:text-6xl" style={{ color: RED }}>{r(p.price)}</span>
      {p.mrp > p.price && <span className="block text-xs text-ink-soft">MRP <s>{r(p.mrp)}</s></span>}
    </Link>
  );
  const photo = (p: ProductCard, cls: string) => p.images[0] && (
    <Link href={`/p/${p.slug}`} className={`relative block aspect-[4/5] overflow-hidden border-[6px] border-white bg-white ${cls}`} style={{ boxShadow: `6px 6px 0 ${MAROON}` }}>
      <Image src={p.images[0].url} alt={p.images[0].alt ?? withBrand(p.name, p.brandName)} fill sizes="(min-width: 768px) 260px, 45vw" className="object-cover" />
      <span className="absolute inset-x-0 bottom-0 bg-white/95 px-2 py-1 text-[11px] font-bold leading-tight" style={{ color: MAROON }}>{withBrand(p.name, p.brandName).replace(/ Thermal Warmer.*$/, "")}</span>
    </Link>
  );

  return (
    <>
    <section aria-label={`${promo.name} sale`} className="relative overflow-hidden" style={{
      background: `radial-gradient(circle at 70% 45%, rgba(255,246,200,.95), rgba(255,246,200,0) 55%), repeating-conic-gradient(from 0deg at 70% 45%, #FFC83A 0deg 9deg, #FFB21A 9deg 18deg)`,
    }}>
      <div className="container-x grid items-center gap-8 py-8 sm:py-10 md:grid-cols-[1.15fr_1fr] md:py-12">
        <div className="relative">
          {maxOff > 0 && (
            <span className="wv-burst absolute -top-3 right-0 z-[1] grid size-24 place-items-center text-center font-display leading-[0.85] text-[#4A1420] uppercase sm:size-36 md:-top-6 md:-right-16 lg:-right-24" style={{ background: "#FFF3B0" }} aria-label={`Up to ${maxOff}% off MRP`}>
              <span><span className="block text-xs sm:text-base">Up to</span><span className="block text-3xl sm:text-5xl" style={{ color: RED }}>{maxOff}%</span><span className="block text-xs sm:text-base">off MRP</span></span>
            </span>
          )}
          <p className="text-xs font-extrabold tracking-[0.3em] uppercase" style={{ color: MAROON }}>WonderVastra presents</p>
          <H className="mt-1 font-display uppercase leading-[0.82]">
            <span className="block text-[4.2rem] sm:text-8xl lg:text-[8.5rem]" style={{ color: MAROON }}>{first}</span>
            {rest.length > 0 && <span className="block text-[4.6rem] sm:text-[6.5rem] lg:text-[9.5rem]" style={{ color: RED, textShadow: `3px 3px 0 #fff, 7px 7px 0 ${MAROON}` }}>{rest.join(" ")}</span>}
          </H>
          <div className="mt-5">
            <p className="flex items-center gap-2 text-sm font-extrabold tracking-[0.14em] uppercase sm:text-base" style={{ color: MAROON }}>
              <span className="wv-flash size-3 rounded-full" style={{ background: RED }} aria-hidden />Hurry! Sale ends in
            </p>
            <div className="mt-2"><Countdown endsAt={promo.endsAt} big /></div>
            <p className="mt-2 text-xs font-extrabold tracking-[0.12em] uppercase" style={{ color: MAROON }}>{promo.ends}</p>
          </div>

          {(kids || men) && (
            <div className="mt-6 flex flex-wrap gap-4">
              {kids && priceCard("Kids' sets from", kids, "wv-wiggle")}
              {men && priceCard("Men's sets from", men, "wv-wiggle-r")}
            </div>
          )}
          {extra && (
            <p className="mt-6 inline-block -rotate-1 px-4 py-2 font-display text-2xl leading-tight text-white uppercase sm:text-3xl" style={{ background: RED, boxShadow: `4px 4px 0 ${MAROON}` }}>
              + Up to {extra} extra off <span className="text-lg sm:text-xl">on family packs</span>
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/sale" className="btn wv-ring px-7 text-base text-white" style={{ background: RED, borderColor: RED }}>Shop the sale →</Link>
            <Link href="/family-pack" className="btn border-[#4A1420] bg-white text-[#4A1420]">Build a family pack</Link>
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold" style={{ color: MAROON }}>
            <span className="inline-flex items-center gap-1.5"><BadgeCheck size={16} aria-hidden /> 100% original {brandPhrase(brands)}</span>
            <span className="inline-flex items-center gap-1.5"><Truck size={16} aria-hidden /> Free delivery, Delhi NCR</span>
          </p>
        </div>

        <div className="relative mx-auto grid w-full max-w-md grid-cols-2 gap-4 md:max-w-none">
          {kids && photo(kids, "-rotate-3 md:mt-10")}
          {men && photo(men, "rotate-3")}
          <span className="wv-spin absolute -top-4 left-[calc(50%-3rem)] grid size-24 place-items-center sm:left-[calc(50%-3.5rem)] rounded-full border-4 border-white text-center font-display text-xl leading-[0.9] text-white uppercase shadow-lg sm:size-28 sm:text-2xl" style={{ background: RED }}>
            100%<br /><span className="text-sm sm:text-base">original</span>
          </span>
        </div>
      </div>
    </section>
    <SaleTape items={["Sale", ...(maxOff ? [`Up to ${maxOff}% off MRP`] : []), ...(extra ? [`Extra ${extra} off`] : []), promo.ends, "Free delivery", "100% original"]} />
    </>
  );
}

/** Two crossing "caution tape" bands of scrolling sale words. */
export function SaleTape({ items }: { items: string[] }) {
  const band = (cls: string, reverse = false) => (
    <div className={`absolute -inset-x-8 py-2 ${cls}`}>
      <div className="marquee-fast flex w-max" style={reverse ? { animationDirection: "reverse" } : undefined}>
        {[0, 1].map((half) => (
          <div key={half} className="flex shrink-0">
            {[...items, ...items, ...items].map((t, i) => <span key={i} className="flex items-center gap-4 pr-4 font-display text-2xl whitespace-nowrap uppercase sm:text-3xl">{t}<span aria-hidden>✦</span></span>)}
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="relative h-28 overflow-hidden bg-white sm:h-32" aria-hidden>
      {band("top-4 -rotate-2 bg-[#4A1420] text-white", true)}
      {band("top-12 rotate-[1.5deg] bg-[#E3202A] text-[#FFC83A] shadow-lg sm:top-14")}
    </div>
  );
}
