"use client";
import { paymentLine } from "@/lib/payment-copy";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bell, Check, ChevronDown, Heart, Link2, MessageCircle, RotateCcw, Ruler, ShieldCheck, Star, Truck, Wallet } from "lucide-react";
import { money } from "@/lib/format";
import { useCart } from "./cart-context";
import { QtyStepper } from "./cart-drawer";
import { Countdown } from "./countdown";

type Variant = {
  id: string; option1: string; option2: string; colorHex: string | null; sku: string | null;
  stock: number; price: number; mrp: number; saleName: string | null; saleEndsAt: number | null;
};
type Product = {
  id: string; name: string; slug: string; shortDescription: string | null; description: string | null; material: string | null; care: string | null; sizeGuide: string | null;
  option1Label: string; option2Label: string; deliveryMode: "free" | "flat"; deliveryCharge: number; codAllowed: boolean; returnable: boolean;
  showStockCount: boolean; lowStockThreshold: number; maxPerOrder: number | null; maxPerCustomer: number | null; forceOutOfStock: boolean; comingSoon: boolean; launchNote: string | null;
};
type Props = {
  brand?: { name: string; slug: string; isHouse: boolean } | null;
  product: Product; images: { url: string; alt: string | null }[]; variants: Variant[];
  rating: { avg: number; count: number }; wished: boolean;
  settings: { codEnabled: boolean; onlinePayments: boolean; dispatchDays: number; deliveryDaysMin: number; deliveryDaysMax: number; returnWindowDays: number };
};

function Accordion({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-bold tracking-[0.08em] uppercase">{title}<ChevronDown size={18} className="transition-transform group-open:rotate-180" aria-hidden /></summary>
      <div className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{children}</div>
    </details>
  );
}

function NotifyForm({ product, variant, soon = false }: { product: Product; variant: Variant | null; soon?: boolean }) {
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  return (
    <div className={soon ? "bg-slate-soft p-4" : "bg-sand-soft p-4"}>
      {soon ? (
        <p className="flex flex-wrap items-center gap-2 font-bold uppercase"><Bell size={18} aria-hidden /> Coming soon{product.launchNote && <span className="text-sm font-semibold normal-case text-ink-soft">· {product.launchNote}</span>}</p>
      ) : <p className="flex items-center gap-2 font-semibold"><Bell size={18} aria-hidden /> {variant ? `${variant.option2 !== "Default" ? variant.option2 + " " : ""}${variant.option1 !== "Free size" ? variant.option1 + " " : ""}is sold out` : "Sold out"}</p>}
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
          <label htmlFor="notify" className="block text-sm">{soon ? "Not on sale yet. Get a message the day it launches:" : "Get a message the moment it's restocked:"}</label>
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

export function ProductDetail({ brand, product: p, images, variants, rating, wished, settings }: Props) {
  const router = useRouter();
  const { add } = useCart();
  const sizes = useMemo(() => [...new Set(variants.map((v) => v.option1))], [variants]);
  const colors = useMemo(() => {
    const m = new Map<string, string | null>();
    variants.forEach((v) => { if (v.option2 !== "Default") m.set(v.option2, v.colorHex); });
    return [...m].map(([name, hex]) => ({ name, hex }));
  }, [variants]);
  const first = variants.find((v) => v.stock > 0) ?? variants[0];
  const [color, setColor] = useState(first?.option2 ?? "Default");
  // Clothing: the buyer must choose a size themselves; guessing one leads to wrong-size orders and returns.
  const needsSize = sizes.length > 1;
  const [size, setSize] = useState(needsSize ? "" : first?.option1 ?? "Free size");
  const [sizeError, setSizeError] = useState(false);
  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);
  const [heart, setHeart] = useState(wished);
  const [copied, setCopied] = useState(false);

  const variant = variants.find((v) => v.option1 === size && v.option2 === color) ?? null;
  const soon = p.comingSoon;
  const nothingLeft = !variants.some((v) => v.stock > 0);
  const choosing = needsSize && !size && !nothingLeft;
  const sold = soon || nothingLeft || (!choosing && (!variant || variant.stock === 0));
  // Prepaid-only item while online payment isn't live yet: say so instead of letting checkout fail.
  const cannotPay = !settings.onlinePayments && !(p.codAllowed && settings.codEnabled);
  const cap = variant ? Math.min(variant.stock, p.maxPerOrder ?? Infinity, p.maxPerCustomer ?? Infinity) : 0;
  const price = variant?.price ?? first?.price ?? 0;
  const mrp = variant?.mrp ?? first?.mrp ?? 0;
  const pct = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const saleEnds = variant?.saleEndsAt ?? first?.saleEndsAt;
  const low = variant && variant.stock > 0 && variant.stock <= p.lowStockThreshold;

  const pickColor = (name: string) => {
    setColor(name); setQty(1);
    const i = images.findIndex((im) => im.alt?.toLowerCase().includes(`in ${name.toLowerCase()}`));
    if (i >= 0) setImgIdx(i);
  };
  const shareUrl = () => `${window.location.origin}/p/${p.slug}`;
  const askSize = () => {
    setSizeError(true);
    document.getElementById("size-picker")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const buyNow = () => { if (choosing) return askSize(); if (variant) { add(variant.id, qty, { open: false }); router.push("/checkout"); } };
  const addCart = () => { if (choosing) return askSize(); if (variant) { add(variant.id, qty); setQty(1); } };
  const toggleWish = async () => {
    const next = !heart;
    setHeart(next);
    const res = await fetch("/api/wishlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: p.id, on: next }) });
    if (res.status === 401) window.location.href = `/login?next=${encodeURIComponent(`/p/${p.slug}?wish=${p.id}`)}`;
  };
  const current = images[imgIdx] ?? images[0];

  return (
    <div className="grid gap-6 pb-24 md:grid-cols-2 md:gap-10 md:pb-0">
      <div className="md:sticky md:top-32 md:self-start">
        <div className="relative aspect-[4/5] overflow-hidden bg-sand-soft">
          {current && <Image key={current.url} src={current.url} alt={current.alt ?? p.name} fill priority sizes="(max-width:768px) 100vw, 50vw" className="pop-in object-cover" />}
          {soon ? <span className="sticker absolute top-3 left-3 bg-slate text-white">Coming soon</span> : pct > 0 && <span className="sticker absolute top-3 left-3 bg-madder text-white">{pct}% off</span>}
        </div>
        {images.length > 1 && (
          <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto p-0.5">
            {images.map((im, i) => (
              <button key={im.url} onClick={() => setImgIdx(i)} aria-label={`Show image ${i + 1}`} aria-current={i === imgIdx} className={`relative h-20 w-16 shrink-0 overflow-hidden border ${i === imgIdx ? "border-ink" : "border-transparent"}`}>
                <Image src={im.url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        {brand && (
          <Link href={`/brands/${brand.slug}`} className="mb-1 inline-flex items-center gap-2 text-xs font-extrabold tracking-[0.12em] uppercase hover:text-madder">
            {brand.name}{brand.isHouse && <span className="bg-ink px-1.5 py-0.5 text-[10px] text-white">Our label</span>}
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
                const any = variants.some((v) => v.option2 === c.name && v.stock > 0);
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
            <legend className="mb-2 text-xs font-bold tracking-[0.08em] uppercase">{choosing ? `Select ${p.option1Label.toLowerCase()}` : p.option1Label}</legend>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => {
                const v = variants.find((x) => x.option1 === s && x.option2 === color);
                const out = !v || v.stock === 0;
                return (
                  <button key={s} type="button" aria-pressed={s === size} onClick={() => { setSize(s); setQty(1); setSizeError(false); }}
                    className={`min-w-12 border px-3.5 py-2.5 text-sm font-semibold ${s === size ? "border-ink bg-ink text-white" : "border-[#cfcfcf] hover:border-ink"} ${out ? "text-ink/40 line-through" : ""}`}>{s}</button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="mt-5" aria-live="polite">
          {sold ? (
            <NotifyForm product={p} variant={soon ? null : variant} soon={soon} />
          ) : (
            <>
              {choosing && <p className={`mb-3 text-sm font-medium ${sizeError ? "text-clay" : "text-ink-soft"}`} role={sizeError ? "alert" : undefined}>{sizeError ? `Please select a ${p.option1Label.toLowerCase()} first.` : `Select a ${p.option1Label.toLowerCase()} to see availability.`}</p>}
              {!choosing && p.showStockCount && (
                <p className={`mb-3 flex items-center gap-2 text-sm ${low ? "text-clay" : "text-pine"}`}>
                  <span className={`size-1.5 rounded-full ${low ? "bg-clay" : "bg-pine"}`} aria-hidden />
                  {low ? `Only ${variant!.stock} ${variant!.stock === 1 ? "piece" : "pieces"} left` : `${variant!.stock} pieces available`}
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

        <ul className="mt-5 grid gap-2 text-sm">
          <li className="flex items-center gap-2"><Truck size={17} strokeWidth={1.5} aria-hidden className="shrink-0" />{p.deliveryMode === "free" ? <span className="text-pine">Free delivery on this item</span> : <span>Delivery charge: {money(p.deliveryCharge)}</span>}</li>
          <li className="flex items-center gap-2"><ShieldCheck size={17} strokeWidth={1.5} aria-hidden className="shrink-0" />Dispatched in {settings.dispatchDays} working days, delivered in about {settings.deliveryDaysMin}–{settings.deliveryDaysMax} days</li>
          <li className="flex items-center gap-2"><Wallet size={17} strokeWidth={1.5} aria-hidden className="shrink-0" />{paymentLine(settings.onlinePayments, p.codAllowed && settings.codEnabled)}</li>
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
          {p.sizeGuide && <Accordion title="Size guide"><span className="flex items-start gap-2"><Ruler size={16} aria-hidden className="mt-0.5 shrink-0" /><span>{p.sizeGuide}</span></span></Accordion>}
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
