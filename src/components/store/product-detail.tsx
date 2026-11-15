"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bell, Check, ChevronDown, Heart, Link2, MessageCircle, RotateCcw, Ruler, ShieldCheck, Star, Truck } from "lucide-react";
import { money } from "@/lib/format";
import { ProductGallery } from "./product-gallery";
import { track } from "./tracker";
import { SizeGuideButton, SizeTables, type SizeTable } from "./size-guide";
import NextImage from "next/image";
import { useCart } from "./cart-context";
import { QtyStepper } from "./cart-drawer";
import { Countdown } from "./countdown";
import { DeliveryCheck } from "./delivery-check";

type Variant = {
  id: string; option1: string; option2: string; colorHex: string | null; sku: string | null;
  stock: number; price: number; mrp: number; saleName: string | null; saleEndsAt: number | null;
};
type Product = {
  id: string; name: string; slug: string; shortDescription: string | null; description: string | null; material: string | null; care: string | null; sizeGuide: string | null; sizeChart?: SizeTable[]; sizeHeights: Record<string, string>;
  option1Label: string; option2Label: string; deliveryMode: "free" | "flat"; deliveryCharge: number; codAllowed: boolean; returnable: boolean;
  showStockCount: boolean; lowStockThreshold: number; maxPerOrder: number | null; maxPerCustomer: number | null; forceOutOfStock: boolean; comingSoon: boolean; launchNote: string | null;
  minPieces?: number; comboAbove?: number | null;
};
type Props = {
  brand?: { name: string; slug: string; isHouse: boolean; logo?: string | null } | null;
  product: Product; images: { url: string; alt: string | null }[]; variants: Variant[];
  rating: { avg: number; count: number }; wished: boolean;
  /** From the link (?size=…&pick=…), e.g. Google Shopping or a reorder: start with this size and piece chosen. */
  initial?: { size?: string; pick?: string };
  settings: { codEnabled: boolean; onlinePayments: boolean; dispatchDays: number; deliveryDaysMin: number; deliveryDaysMax: number; returnWindowDays: number; deliveryArea: string; areaRestricted: boolean };
  /** Cart offers, cheapest threshold first: "₹1,000+ → 10% off". */
  tiers?: { minSubtotal: number; minPieces: number; label: string; reward: string }[];
};

function Accordion({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line py-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[13px] font-bold tracking-[0.08em] uppercase">{title}<ChevronDown size={18} className="transition-transform group-open:rotate-180" aria-hidden /></summary>
      <div className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{children}</div>
    </details>
  );
}

function soldLabel(p: Product, v: Variant | null) {
  const parts = v ? [v.option1 !== "Free size" ? `${p.option1Label} ${v.option1}` : "", v.option2 !== "Default" ? v.option2 : ""].filter(Boolean) : [];
  return parts.length ? `${parts.join(" in ")} is sold out` : "Sold out";
}

function NotifyForm({ product, variant, soon = false, inStock = [], otherColors = [], onColor }: { product: Product; variant: Variant | null; soon?: boolean; inStock?: string[]; otherColors?: string[]; onColor?: (c: string) => void }) {
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  return (
    <div className={soon ? "bg-slate-soft p-4" : "bg-sand-soft p-4"}>
      {soon ? (
        <p className="flex flex-wrap items-center gap-2 font-bold uppercase"><Bell size={18} aria-hidden /> Coming soon{product.launchNote && <span className="text-sm font-semibold normal-case text-ink-soft">· {product.launchNote}</span>}</p>
      ) : <p className="flex items-center gap-2 font-semibold"><Bell size={18} aria-hidden /> {soldLabel(product, variant)}</p>}
      {!soon && otherColors.length > 0 && variant && (
        <p className="mt-1 text-sm">This size is in stock in {otherColors.map((c, i) => <span key={c}>{i ? ", " : ""}<button type="button" className="font-semibold underline" onClick={() => onColor?.(c)}>{c}</button></span>)}.</p>
      )}
      {!soon && inStock.length > 0 && <p className="mt-1 text-sm text-ink-soft">In stock: {inStock.join(", ")}</p>}
      {state === "done" ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-pine" role="status"><Check size={16} aria-hidden /> You&apos;re on the list. {soon ? "We'll message you the day it launches." : "We'll message you as soon as it's back."}</p>
      ) : (
        <form className="mt-2 space-y-2" onSubmit={async (e) => {
          e.preventDefault();
          setState("busy"); setError("");
          const res = await fetch("/api/stock-alert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, variantId: variant?.id, contact }) });
          const json = await res.json();
          if (!res.ok) { setError(json.error ?? "Please try again."); setState("idle"); } else setState("done");
        }}>
          <label htmlFor="notify" className="block text-sm">{soon ? "Not on sale yet. Get a message the day it launches:" : `Get a message the moment ${variant && variant.option1 !== "Free size" ? `size ${variant.option1}` : "it"} is back:`}</label>
          <div className="flex gap-2">
            <input id="notify" required value={contact} onChange={(e) => setContact(e.target.value)} className="input" placeholder="WhatsApp number or email" />
            <button disabled={state === "busy"} className="btn btn-ink shrink-0">Notify me</button>
          </div>
          {error && <p className="text-sm font-medium text-clay" role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}

/** A listing sold as separate Top and Bottom pieces also offers both together. A set has no stock of its own: it takes one of each piece. */
export const SET = "Set (Top + Bottom)";
/** Piece names that are a lower half; any name ending in "top" is an upper half ("Top", "V-neck top"). */
const BOTTOM = /^(bottom|trousers?|lower)$/i;
const TOP = /top$/i;

export function ProductDetail({ brand, product: p, images, variants, rating, wished, settings, tiers = [], initial }: Props) {
  const router = useRouter();
  const { add } = useCart();
  const sizes = useMemo(() => [...new Set(variants.map((v) => v.option1))], [variants]);
  // A listing sold as tops and a bottom also offers each top with the bottom as a set: "Set (Top + Bottom)".
  const { colors, sets } = useMemo(() => {
    const m = new Map<string, string | null>();
    variants.forEach((v) => { if (v.option2 !== "Default") m.set(v.option2, v.colorHex); });
    const list = [...m].map(([name, hex]) => ({ name, hex }));
    const bottom = list.find((c) => BOTTOM.test(c.name))?.name;
    const sets = new Map<string, [string, string]>();
    if (bottom) for (const c of list) if (TOP.test(c.name)) sets.set(`Set (${c.name} + ${bottom})`, [c.name, bottom]);
    return { colors: [...[...sets.keys()].map((name) => ({ name, hex: null })), ...list], sets };
  }, [variants]);
  const isSet = (c: string) => sets.has(c);
  const hasSet = sets.size > 0;
  // Text choices (Top / Bottom / Set) are shown as buttons, real colours as swatches.
  const asText = colors.length > 0 && colors.every((c) => !c.hex);
  /** The variant for a size and choice; for a set, a combined view of its top and bottom. */
  const pick = (s: string, c: string): Variant | null => {
    const parts = sets.get(c);
    if (!parts) return variants.find((v) => v.option1 === s && v.option2 === c) ?? null;
    const t = variants.find((v) => v.option1 === s && v.option2 === parts[0]), b = variants.find((v) => v.option1 === s && v.option2 === parts[1]);
    if (!t || !b) return null;
    return { ...t, id: `${t.id}+${b.id}`, option2: c, stock: Math.min(t.stock, b.stock), price: t.price + b.price, mrp: t.mrp + b.mrp, saleEndsAt: t.saleEndsAt ?? b.saleEndsAt, saleName: t.saleName ?? b.saleName };
  };
  const first = variants.find((v) => v.stock > 0) ?? variants[0];
  const startPick = initial?.pick && colors.some((c) => c.name === initial.pick) ? initial.pick : null;
  const [color, setColor] = useState(startPick ?? (hasSet ? colors[0].name : first?.option2 ?? "Default"));
  /** Listings sold in twos start at two single pieces; a set is already two. */
  const qtyFor = (c: string) => (isSet(c) ? 1 : Math.max(1, p.minPieces ?? 1));
  // Clothing: the buyer must choose a size themselves; guessing one leads to wrong-size orders and returns.
  const needsSize = sizes.length > 1;
  const [size, setSize] = useState(initial?.size && sizes.includes(initial.size) ? initial.size : needsSize ? "" : first?.option1 ?? "Free size");
  const [sizeError, setSizeError] = useState(false);
  const [qty, setQty] = useState(() => qtyFor(startPick ?? (hasSet ? colors[0].name : first?.option2 ?? "Default")));
  const [imgIdx, setImgIdx] = useState(0);
  const [heart, setHeart] = useState(wished);
  const [copied, setCopied] = useState(false);

  const variant = pick(size, color);
  const soon = p.comingSoon;
  const nothingLeft = !variants.some((v) => v.stock > 0);
  const choosing = needsSize && !size && !nothingLeft;
  const sold = soon || nothingLeft || (!choosing && (!variant || variant.stock === 0));
  // Prepaid-only item while online payment isn't live yet: say so instead of letting checkout fail.
  const cannotPay = !settings.onlinePayments && !(p.codAllowed && settings.codEnabled);
  const cap = variant ? Math.min(variant.stock, p.maxPerOrder ?? Infinity, p.maxPerCustomer ?? Infinity) : 0;
  // Before a size is picked, show the chosen piece (or set) in its first size that's in stock.
  const shown = variant ?? pick(sizes.find((sz) => (pick(sz, color)?.stock ?? 0) > 0) ?? sizes[0], color) ?? first;
  const price = shown?.price ?? 0;
  const mrp = shown?.mrp ?? 0;
  const pct = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const saleEnds = variant?.saleEndsAt ?? first?.saleEndsAt;
  const low = variant && variant.stock > 0 && variant.stock <= p.lowStockThreshold;

  const pickColor = (name: string) => {
    setColor(name); setQty(qtyFor(name));
    const i = images.findIndex((im) => im.alt?.toLowerCase().includes(`in ${name.toLowerCase()}`));
    if (i >= 0) setImgIdx(i);
  };
  const shareUrl = () => `${window.location.origin}/p/${p.slug}`;
  const askSize = () => {
    setSizeError(true);
    document.getElementById("size-picker")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const addVariant = (open: boolean) => { if (variant) { for (const id of variant.id.split("+")) add(id, Math.min(qty, Math.max(cap, 1)), { open }); track("add_to_cart", `${p.name} · ${variant.option2} · ${variant.option1}`, p.id); } };
  const buyNow = () => { if (choosing) return askSize(); if (variant) { addVariant(false); router.push("/checkout"); } };
  const addCart = () => { if (choosing) return askSize(); if (variant) { addVariant(true); setQty(qtyFor(color)); } };
  /** For "notify me" on a sold-out set: the piece that ran out. */
  const alertVariant = variant && isSet(color) ? variants.find((v) => variant.id.split("+").includes(v.id) && v.stock === 0) ?? null : variant;
  const toggleWish = async () => {
    const next = !heart;
    setHeart(next);
    const res = await fetch("/api/wishlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: p.id, on: next }) });
    if (res.status === 401) window.location.href = `/login?next=${encodeURIComponent(`/p/${p.slug}?wish=${p.id}`)}`;
  };

  return (
    <div className="grid gap-6 pb-24 md:grid-cols-2 md:gap-10 md:pb-0" data-product-id={p.id}>
      <div className="-mx-4 min-w-0 sm:mx-0 md:sticky md:top-32 md:self-start">
        <ProductGallery images={images} name={p.name} index={imgIdx} onIndex={setImgIdx}
          badge={soon ? <span className="sticker absolute top-3 left-3 bg-slate text-white">Coming soon</span> : pct > 0 && <span className="sticker absolute top-3 left-3 bg-madder text-white">{pct}% off</span>} />
      </div>

      <div>
        {brand && (
          <Link href={`/brands/${brand.slug}`} className="mb-2 inline-flex items-center gap-2.5 text-xs font-extrabold tracking-[0.12em] uppercase hover:text-madder" data-testid="brand-link">
            {brand.logo && <span className="relative h-10 w-24 shrink-0 overflow-hidden rounded-sm border border-line bg-white"><NextImage src={brand.logo} alt="" fill sizes="96px" className="object-contain p-0.5" /></span>}
            <span>{brand.name}</span>{brand.isHouse && <span className="bg-ink px-1.5 py-0.5 text-[11px] text-white">Our label</span>}
          </Link>
        )}
        <h1 className="text-[2.4rem] sm:text-5xl">{p.name}</h1>
        {rating.count > 0 && <a href="#reviews" className="mt-1 inline-flex items-center gap-1 text-sm font-medium"><Star size={15} className="fill-ink text-ink" aria-hidden />{rating.avg.toFixed(1)} <span className="font-normal underline">({rating.count} reviews)</span></a>}
        {p.shortDescription && <p className="mt-2 text-ink-soft">{p.shortDescription}</p>}

        <div className="mt-4 flex flex-wrap items-baseline gap-x-3">
          <span className="text-[1.75rem] font-bold" data-testid="price">{money(price)}</span>
          {mrp > price && <><span className="text-ink-soft">MRP <s>{money(mrp)}</s></span><span className="font-bold text-madder">{pct}% off</span></>}
        </div>
        <p className="text-xs text-ink-soft">Inclusive of all taxes</p>
        {brand && !brand.isHouse && (
          <p className="mt-2 inline-flex items-center gap-1.5 bg-pine-soft px-2.5 py-1 text-xs font-bold text-pine"><ShieldCheck size={14} aria-hidden /> 100% original {brand.name} product, at our lowest price</p>
        )}

        {(p.minPieces ?? 1) > 1 && (
          <div className="mt-3 border border-dashed border-ink/40 bg-sand-soft p-3 text-sm" data-testid="combo">
            <p><b>Sold in {p.minPieces}s.</b> Mix any sizes, tops and trousers{isSet(color) ? ", or take a set" : ""}.</p>
            {(() => {
              const first = tiers.filter((t) => t.minPieces > 0).sort((x, y) => x.minPieces - y.minPieces)[0];
              return first
                ? <p className="mt-1 text-xs text-ink-soft">Going for {first.reward}? A single piece is fine in a cart of {first.minPieces} or more pieces.</p>
                : p.comboAbove != null && <p className="mt-1 text-xs text-ink-soft">Cart over {money(p.comboAbove)}? Single pieces are fine too.</p>;
            })()}
          </div>
        )}

        {saleEnds && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 bg-madder px-3 py-2.5 text-sm font-semibold text-white">
            <span className="uppercase">{variant?.saleName ?? first?.saleName} ends in</span><Countdown endsAt={saleEnds} compact />
          </div>
        )}

        {colors.length > 0 && (
          <fieldset className="mt-5">
            <legend className="mb-2 text-xs font-bold tracking-[0.08em] uppercase">{p.option2Label}: <span className="font-semibold normal-case tracking-normal text-ink-soft">{color}</span></legend>
            <div className="flex flex-wrap gap-2.5">
              {colors.map((c) => {
                const any = sizes.some((s) => (pick(s, c.name)?.stock ?? 0) > 0);
                if (asText) return (
                  <button key={c.name} type="button" aria-pressed={c.name === color} onClick={() => pickColor(c.name)}
                    className={`min-h-11 border px-3.5 py-2 text-sm font-semibold ${c.name === color ? "border-ink bg-ink text-white" : "border-[#cfcfcf] hover:border-ink"} ${any ? "" : "text-ink/40 line-through"}`}>{c.name}</button>
                );
                return (
                  <button key={c.name} type="button" aria-pressed={c.name === color} aria-label={`${c.name}${any ? "" : ", sold out"}`} title={c.name} onClick={() => pickColor(c.name)}
                    className={`relative size-9 rounded-full border ${c.name === color ? "border-ink ring-1 ring-ink ring-offset-2" : "border-ink/15"} ${any ? "" : "opacity-40"}`} style={{ background: c.hex ?? "#ddd" }} />
                );
              })}
            </div>
          </fieldset>
        )}
        {(sizes.length > 1 || sizes[0] !== "Free size") && (
          <fieldset id="size-picker" className={`mt-5 ${sizeError && choosing ? "-m-2 border border-clay p-2" : ""}`}>
            <legend className="mb-2 flex w-full items-center justify-between gap-3 text-xs font-bold tracking-[0.08em] uppercase">
              <span>{choosing ? `Select ${p.option1Label.toLowerCase()}` : p.option1Label}</span>
              <span className="tracking-normal normal-case"><SizeGuideButton tables={p.sizeChart ?? []} note={p.sizeChart?.length ? null : p.sizeGuide} charts={images.filter((im) => /size chart|size guide/i.test(im.alt ?? ""))} selected={size || undefined} name={p.name} /></span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => {
                const v = pick(s, color);
                const out = !v || v.stock === 0;
                const h = p.sizeHeights[s];
                return (
                  <button key={s} type="button" aria-pressed={s === size} aria-label={h ? `${s}, ${h} cm${out ? ", sold out" : ""}` : undefined} onClick={() => { setSize(s); setQty(qtyFor(color)); setSizeError(false); }}
                    className={`min-h-11 min-w-12 border px-3.5 text-sm font-semibold ${h ? "py-1.5 leading-tight" : "py-2.5"} ${s === size ? "border-ink bg-ink text-white" : "border-[#cfcfcf] hover:border-ink"} ${out ? "text-ink/40 line-through" : ""}`}>
                    {s}{h && <span className={`block text-[11px] font-medium ${s === size ? "text-white/80" : "text-ink-soft"}`}>{h} cm</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="mt-5" aria-live="polite">
          {sold ? (
            <NotifyForm key={variant?.id ?? "all"} product={p} variant={soon ? null : alertVariant} soon={soon} inStock={nothingLeft || soon ? [] : sizes.filter((s) => (pick(s, color)?.stock ?? 0) > 0)}
              otherColors={nothingLeft || soon || !variant ? [] : colors.map((c) => c.name).filter((c) => c !== color && (pick(variant.option1, c)?.stock ?? 0) > 0)} onColor={pickColor} />
          ) : (
            <>
              {choosing && <p className={`mb-3 text-sm font-medium ${sizeError ? "text-clay" : "text-ink-soft"}`} role={sizeError ? "alert" : undefined}>{sizeError ? `Please select a ${p.option1Label.toLowerCase()} first.` : `Select a ${p.option1Label.toLowerCase()} to see availability.`}</p>}
              {!choosing && p.showStockCount && (
                <p className={`mb-3 flex items-center gap-2 text-sm ${low ? "text-clay" : "text-pine"}`}>
                  <span className={`size-1.5 rounded-full ${low ? "bg-clay" : "bg-pine"}`} aria-hidden />
                  {isSet(color)
                    ? low ? `Only ${variant!.stock} ${variant!.stock === 1 ? "set" : "sets"} left` : `${variant!.stock} sets available`
                    : low ? `Only ${variant!.stock} ${variant!.stock === 1 ? "piece" : "pieces"} left` : `${variant!.stock} pieces available`}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {!choosing && <QtyStepper qty={qty} max={cap} label={p.name} onChange={setQty} />}
                {(p.maxPerOrder || p.maxPerCustomer) && <span className="text-xs font-medium text-ink-soft">Limit {[p.maxPerOrder && `${p.maxPerOrder} per order`, p.maxPerCustomer && `${p.maxPerCustomer} per customer`].filter(Boolean).join(", ")}</span>}
              </div>
              {cannotPay
                ? <p className="mt-4 rounded-sm border border-line bg-sand-soft p-3 text-sm font-medium">This item is prepaid only, and online payment opens soon. Please check back shortly.</p>
                : <div className="mt-4 hidden gap-3 md:flex">
                    <button onClick={addCart} className="btn btn-white flex-1">Add to cart</button>
                    <button onClick={buyNow} className="btn btn-primary flex-1">Buy now</button>
                  </div>}
            </>
          )}
        </div>

        {tiers.length > 0 && !soon && (
          <div className="mt-5 bg-sand-soft p-3" data-testid="tiers">
            <p className="text-[13px] font-bold tracking-[0.08em] uppercase">Buy more, save more</p>
            <ul className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
              {tiers.map((t) => (
                <li key={`${t.minPieces}-${t.minSubtotal}`} className="border border-dashed border-ink/40 bg-white px-2.5 py-2 text-center">
                  <span className="block text-xs font-semibold">{t.label}</span>
                  <b className="block text-lg leading-tight text-madder">Extra {t.reward}</b>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">Extra, on top of the prices you see. {tiers.some((t) => t.minPieces) ? "Mix any styles, sizes and brands. " : "Mix any items. "}Applied automatically in your cart.</p>
          </div>
        )}

        {!soon && <DeliveryCheck area={settings.deliveryArea} restricted={settings.areaRestricted} days={`Delivered in about ${settings.deliveryDaysMin}–${settings.deliveryDaysMax} days. Enter your pincode for the exact date.`} />}

        <ul className="mt-5 grid gap-2 text-sm">
          <li className="flex items-center gap-2"><Truck size={17} strokeWidth={1.5} aria-hidden className="shrink-0" />{p.deliveryMode === "free" || p.deliveryCharge === 0 ? <span className="text-pine">Free delivery</span> : <span>Delivery charge: {money(p.deliveryCharge)}</span>}</li>
          <li className="flex items-center gap-2"><ShieldCheck size={17} strokeWidth={1.5} aria-hidden className="shrink-0" />Delivered in about {settings.deliveryDaysMin}–{settings.deliveryDaysMax} days</li>
          
          <li className="flex items-center gap-2"><RotateCcw size={17} strokeWidth={1.5} aria-hidden className="shrink-0" />{p.returnable ? `Returnable within ${settings.returnWindowDays} days of delivery` : "This item can't be returned"}</li>
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <a className="btn btn-white btn-sm" target="_blank" rel="noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(`${p.name} from WonderVastra`)}%20${encodeURIComponent(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/p/${p.slug}?utm_source=whatsapp&utm_campaign=share`)}`}>
            <MessageCircle size={15} aria-hidden /> Share
          </a>
          <button className="btn btn-white btn-sm" onClick={async () => { await navigator.clipboard?.writeText(shareUrl()).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <Check size={15} aria-hidden /> : <Link2 size={15} aria-hidden />} {copied ? "Copied" : "Copy link"}
          </button>
          <button className="btn btn-white btn-sm" onClick={toggleWish} aria-pressed={heart}>
            <Heart size={15} className={heart ? "fill-madder text-madder" : ""} aria-hidden /> {heart ? "Wishlisted" : "Wishlist"}
          </button>
        </div>

        <div className="mt-5 border-t border-line">
          {p.description && <Accordion title="Description" open>{p.description}</Accordion>}
          {p.material && <Accordion title="Material">{p.material}</Accordion>}
          {(p.sizeChart?.length || p.sizeGuide || sizes.some((s) => p.sizeHeights[s])) && (
            <Accordion title="Size guide" open={!p.description}>
              {p.sizeChart?.length ? <div className="whitespace-normal text-ink"><SizeTables tables={p.sizeChart} highlight={size || undefined} /></div> : null}
              {sizes.some((s) => p.sizeHeights[s]) && (
                <table className="mb-2 w-full max-w-xs text-left text-sm whitespace-normal [&_td]:border-b [&_td]:border-line [&_td]:py-1 [&_th]:pb-1 [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase">
                  <thead><tr><th>{p.option1Label}</th><th>Child&apos;s height</th></tr></thead>
                  <tbody>{sizes.map((s) => <tr key={s}><td className="font-medium text-ink">{s}</td><td>{p.sizeHeights[s] ? `${p.sizeHeights[s]} cm` : "—"}</td></tr>)}</tbody>
                </table>
              )}
              {sizes.some((s) => p.sizeHeights[s]) && <span className="mb-2 block text-xs">Between sizes? Pick by height, and size up for room to grow.</span>}
              {p.sizeGuide && <span className="flex items-start gap-2"><Ruler size={16} aria-hidden className="mt-0.5 shrink-0" /><span>{p.sizeGuide}</span></span>}
            </Accordion>
          )}
          {p.care && <Accordion title="Care">{p.care}</Accordion>}
        </div>
      </div>

      {!sold && !cannotPay && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-line bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] md:hidden">
          <div className="min-w-14"><p className="text-lg leading-none font-bold">{money(price)}</p>{mrp > price && <s className="text-xs text-ink-soft">{money(mrp)}</s>}</div>
          <button onClick={addCart} className="btn btn-white flex-1 px-2">Add to cart</button>
          <button onClick={buyNow} className="btn btn-primary flex-1 px-2">Buy now</button>
        </div>
      )}
    </div>
  );
}
