"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Bell, Heart, Plus, Star } from "lucide-react";
import type { ProductCard as Card } from "@/lib/catalog";
import { money } from "@/lib/format";
import { useCart } from "./cart-context";

export function ProductCard({ p, priority = false, wished = false }: { p: Card; priority?: boolean; wished?: boolean }) {
  const { add } = useCart();
  const [heart, setHeart] = useState(wished);
  const img = p.images[0];
  const hoverImg = p.images[1];

  async function toggleWish() {
    const next = !heart;
    setHeart(next);
    const res = await fetch("/api/wishlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: p.id, on: next }) });
    // Logged out: log in, and the heart tap is completed straight after (?wish=…).
    if (res.status === 401) { const u = new URL(window.location.href); u.searchParams.set("wish", p.id); window.location.href = `/login?next=${encodeURIComponent(u.pathname + u.search)}`; }
  }

  const soldOut = !p.inStock && !p.comingSoon;
  const badge = p.comingSoon ? { text: "Coming soon", cls: "bg-slate text-white" }
    : soldOut ? { text: "Sold out", cls: "bg-white text-ink" }
    : p.discountPct > 0 && !p.comingSoon ? { text: `${p.discountPct}% off`, cls: "bg-madder text-white" }
    : p.tags.includes("new") ? { text: "New", cls: "bg-ink text-white" }
    : p.tags.includes("bestseller") ? { text: "Bestseller", cls: "bg-white text-ink" } : null;

  return (
    <article className="group relative flex min-w-0 flex-col">
      <div className="relative aspect-[4/5] overflow-hidden bg-sand-soft">
        <Link href={`/p/${p.slug}`} aria-label={p.brandName ? `${p.brandName} ${p.name}` : p.name} className="absolute inset-0 block">
          {img && <Image src={img.url} alt={img.alt ?? p.name} fill priority={priority} sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw" className={`object-cover transition duration-500 group-hover:scale-[1.03] ${hoverImg ? "group-hover:opacity-0" : ""} ${p.inStock ? "" : "opacity-70"}`} />}
          {hoverImg && <Image src={hoverImg.url} alt="" fill sizes="25vw" className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />}
        </Link>
        {badge && <span className={`sticker pointer-events-none absolute top-2 left-2 ${badge.cls}`}>{badge.text}</span>}
        <button type="button" onClick={toggleWish} aria-label={heart ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`} aria-pressed={heart} className="absolute top-1 right-1 grid size-10 place-items-center">
          <span className="grid size-8 place-items-center rounded-full bg-white/90"><Heart size={16} className={heart ? "fill-madder text-madder" : ""} aria-hidden /></span>
        </button>
        {p.inStock && p.singleVariantId && (
          <button type="button" onClick={() => add(p.singleVariantId!)} aria-label={`Add ${p.name} to cart`} className="absolute right-2 bottom-2 grid size-9 place-items-center bg-ink text-white transition-colors hover:bg-madder">
            <Plus size={18} aria-hidden />
          </button>
        )}
        {p.comingSoon && p.launchNote && p.launchNote.trim().toLowerCase() !== "coming soon" && <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink/80 px-2 py-1.5 text-center text-[11px] font-bold tracking-[0.06em] text-white uppercase">{p.launchNote}</span>}
      </div>
      <div className="flex flex-1 flex-col pt-2.5">
        {p.brandName && <p className="mb-0.5 truncate text-[11px] font-extrabold tracking-[0.08em] uppercase">{p.brandSlug ? <Link href={`/brands/${p.brandSlug}`} className="relative -my-1.5 inline-block py-1.5 pr-2 hover:text-madder">{p.brandName}</Link> : p.brandName}</p>}
        <h3 className={`line-clamp-2 text-[13px] leading-snug sm:text-sm ${p.brandName ? "text-ink-soft" : "font-semibold"}`}><Link href={`/p/${p.slug}`} className="hover:underline">{p.name}</Link></h3>
        {p.ratingCount > 0 && <p className="mt-0.5 flex items-center gap-1 text-xs"><Star size={12} className="fill-ink" aria-hidden /><b>{p.rating.toFixed(1)}</b><span className="text-ink-soft">({p.ratingCount})</span></p>}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="font-bold">{money(p.price)}</span>
          {p.mrp > p.price && !p.comingSoon && <><s className="text-xs text-ink-soft">{money(p.mrp)}</s><span className="text-xs font-bold text-madder">{p.discountPct}% off</span></>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold">
          {p.colors.length > 1 && (
            <span className="flex items-center gap-1" aria-label={`${p.colors.length} colours`}>
              {p.colors.slice(0, 4).map((c) => <span key={c.name} title={c.name} className="size-3 rounded-full ring-1 ring-black/15" style={{ background: c.hex ?? "#ddd" }} />)}
              {p.colors.length > 4 && <span className="text-ink-soft">+{p.colors.length - 4}</span>}
            </span>
          )}
          {p.comingSoon || soldOut ? <span className="flex items-center gap-1 text-slate"><Bell size={11} aria-hidden />Notify me</span>
            : p.lowStock && p.showStockCount ? <span className="text-madder">Only {p.totalStock} left</span>
            : p.freeDelivery ? <span className="text-pine">Free delivery</span> : null}
        </div>
      </div>
    </article>
  );
}
