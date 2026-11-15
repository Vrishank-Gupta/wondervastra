"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteDiscount, saveCoupon, saveOffer, saveSale } from "@/app/admin/actions";
import type { schema } from "@/db";
import { formatDateTime, money } from "@/lib/format";
import { isOpenEnded, NO_END } from "@/lib/pricing";
import { OfferLadder } from "./offer-ladder";
import { Empty, Panel } from "./ui";

type Sale = typeof schema.sales.$inferSelect;
type Coupon = typeof schema.coupons.$inferSelect;
type Offer = typeof schema.cartOffers.$inferSelect;
type Opt = { id: string; name: string };

/** datetime-local shows the seller's own clock; everything is stored as an absolute time. */
const toLocal = (ms: number | null | undefined) => {
  if (!ms) return "";
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (s: string) => (s ? new Date(s).getTime() : null);
const rup = (p: number | null | undefined) => (p == null ? "" : String(p / 100));
const toP = (s: string) => Math.round(Number(s || 0) * 100);
const optP = (s: string) => (s.trim() ? toP(s) : null);
const optI = (s: string) => (s.trim() ? Math.floor(Number(s)) : null);

function liveState(r: { active: boolean; startsAt?: number | null; endsAt?: number | null }) {
  const now = Date.now();
  if (!r.active) return { label: "Off", cls: "bg-line" };
  if (r.startsAt && r.startsAt > now) return { label: "Scheduled", cls: "bg-slate-soft" };
  if (r.endsAt && r.endsAt <= now) return { label: "Ended", cls: "bg-line" };
  return { label: "Live", cls: "bg-pine-soft" };
}
const Badge = ({ r }: { r: Parameters<typeof liveState>[0] }) => { const s = liveState(r); return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>; };
const F = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => <div><label className="label text-xs" htmlFor={id}>{label}</label>{children}</div>;

function Row({ title, badge, sub, onEdit, onDelete, extra }: { title: string; badge: React.ReactNode; sub: string; onEdit: () => void; onDelete: () => void; extra?: React.ReactNode }) {
  const [c, setC] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2.5 first:border-0">
      <div className="min-w-48 flex-1"><p className="font-medium">{title} {badge}</p><p className="text-xs text-ink-soft">{sub}</p></div>
      {extra}
      <button aria-label={`Edit ${title}`} className="grid size-9 place-items-center" onClick={onEdit}><Pencil size={15} /></button>
      {c ? <button className="btn btn-ink btn-sm" onClick={onDelete}>Delete?</button> : <button aria-label={`Delete ${title}`} className="grid size-9 place-items-center hover:text-clay" onClick={() => setC(true)}><Trash2 size={15} /></button>}
    </li>
  );
}

export function DiscountManager({ sales, coupons, offers, categories, brands, products }: { sales: Sale[]; coupons: Coupon[]; offers: Offer[]; categories: Opt[]; brands: Opt[]; products: Opt[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"offers" | "sales" | "coupons">("offers");
  const [error, setError] = useState("");
  const [sale, setSale] = useState<Record<string, unknown> | null>(null);
  const [coupon, setCoupon] = useState<Record<string, unknown> | null>(null);
  const [offer, setOffer] = useState<Record<string, unknown> | null>(null);
  const [copied, setCopied] = useState("");

  const after = (r: { error?: string }, close: () => void) => { if (r.error) setError(r.error); else { setError(""); close(); router.refresh(); } };
  const del = async (k: "sale" | "coupon" | "offer", id: string) => { await deleteDiscount(k, id); router.refresh(); };
  const tabBtn = (t: typeof tab, label: string, n: number) => <button role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${tab === t ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{label} ({n})</button>;

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-2">{tabBtn("offers", "Cart offers", offers.length)}{tabBtn("sales", "Sales", sales.length)}{tabBtn("coupons", "Coupons", coupons.length)}</div>
      {error && <p className="rounded-sm bg-clay-soft p-3 text-sm font-medium" role="alert">{error}</p>}

      {tab === "offers" && <OfferLadder offers={offers} />}
      {tab === "offers" && (
        <Panel title="All cart offers" actions={!offer && <button className="btn btn-primary btn-sm" onClick={() => setOffer({ name: "", type: "free_shipping", value: "", min: "", max: "", combines: true, starts: "", ends: "", active: true })}><Plus size={14} aria-hidden /> New offer</button>}>
          <p className="mb-3 text-sm text-ink-soft">Each offer on its own, for anything the ladder above doesn&apos;t cover, such as a ₹ amount off or an offer with an end date. The buyer always gets the single best one.</p>
          {offer && (
            <form className="mb-4 grid gap-3 rounded-sm bg-ivory p-3 sm:grid-cols-3" onSubmit={async (e) => {
              e.preventDefault();
              const o = offer as Record<string, string & boolean>;
              const type = o.type as unknown as string;
              const r = await saveOffer({ id: o.id || undefined, name: o.name, type, value: type === "percent" ? Number(o.value) : type === "flat" ? toP(o.value) : 0, minSubtotal: toP(o.min), maxDiscount: optP(o.max), combinesWithCoupons: o.combines, startsAt: fromLocal(o.starts), endsAt: fromLocal(o.ends), active: o.active });
              after(r, () => setOffer(null));
            }}>
              <F id="on" label="Name shown to buyers"><input id="on" className="input" required placeholder="Free delivery above ₹499" value={String(offer.name)} onChange={(e) => setOffer({ ...offer, name: e.target.value })} /></F>
              <F id="omin" label="When cart is at least ₹"><input id="omin" className="input" type="number" min="0" required value={String(offer.min)} onChange={(e) => setOffer({ ...offer, min: e.target.value })} /></F>
              <F id="ot" label="Reward"><select id="ot" className="input" value={String(offer.type)} onChange={(e) => setOffer({ ...offer, type: e.target.value })}><option value="free_shipping">Free delivery</option><option value="percent">% off cart</option><option value="flat">₹ off cart</option></select></F>
              {offer.type !== "free_shipping" && <F id="ov" label={offer.type === "percent" ? "Percent off" : "₹ off"}><input id="ov" className="input" type="number" min="1" required value={String(offer.value)} onChange={(e) => setOffer({ ...offer, value: e.target.value })} /></F>}
              {offer.type === "percent" && <F id="omax" label="Biggest discount allowed ₹ (optional)"><input id="omax" className="input" type="number" min="1" value={String(offer.max)} onChange={(e) => setOffer({ ...offer, max: e.target.value })} /></F>}
              <F id="os" label="Starts (optional)"><input id="os" className="input" type="datetime-local" value={String(offer.starts)} onChange={(e) => setOffer({ ...offer, starts: e.target.value })} /></F>
              <F id="oe" label="Ends (optional)"><input id="oe" className="input" type="datetime-local" value={String(offer.ends)} onChange={(e) => setOffer({ ...offer, ends: e.target.value })} /></F>
              <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" className="size-4 accent-ink" checked={Boolean(offer.combines)} onChange={(e) => setOffer({ ...offer, combines: e.target.checked })} /> Can be used together with coupons</label>
              <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" className="size-4 accent-ink" checked={Boolean(offer.active)} onChange={(e) => setOffer({ ...offer, active: e.target.checked })} /> On</label>
              <div className="flex gap-2 sm:col-span-3"><button className="btn btn-ink btn-sm">Save offer</button><button type="button" className="btn btn-white btn-sm" onClick={() => setOffer(null)}>Cancel</button></div>
            </form>
          )}
          {offers.length ? <ul>{offers.map((o) => (
            <Row key={o.id} title={o.name} badge={<Badge r={o} />} sub={`${o.minPieces ? `When the cart has ${o.minPieces} or more pieces` : o.minSubtotal ? `When the cart is ${money(o.minSubtotal)} or more` : "On every order"}: ${o.type === "free_shipping" ? "free delivery" : o.type === "percent" ? `${o.value}% off${o.maxDiscount ? ` (up to ${money(o.maxDiscount)})` : ""}` : `${money(o.value)} off`}${o.endsAt ? ` · ends ${formatDateTime(o.endsAt)}` : ""}`}
              onEdit={() => setOffer({ id: o.id, name: o.name, type: o.type, value: o.type === "percent" ? String(o.value) : rup(o.value), min: rup(o.minSubtotal), max: rup(o.maxDiscount), combines: o.combinesWithCoupons, starts: toLocal(o.startsAt), ends: toLocal(o.endsAt), active: o.active })} onDelete={() => del("offer", o.id)} />
          ))}</ul> : <Empty>No cart offers yet.</Empty>}
        </Panel>
      )}

      {tab === "sales" && (
        <Panel title="Sales" actions={!sale && <button className="btn btn-primary btn-sm" onClick={() => setSale({ name: "", badge: "", type: "percent", value: "", scope: "all", targetIds: [], starts: toLocal(Date.now()), ends: toLocal(Date.now() + 3 * 86400000), noEnd: false, q: "", banner: true, active: true })}><Plus size={14} aria-hidden /> New sale</button>}>
          <p className="mb-3 text-sm text-ink-soft">Discount the whole store, whole categories, brands or single listings. Starts and ends by itself, with a live countdown on the store, or runs with no end date. If several sales apply, the buyer gets the best price.</p>
          {sale && (
            <form className="mb-4 grid gap-3 rounded-sm bg-ivory p-3 sm:grid-cols-3" onSubmit={async (e) => {
              e.preventDefault();
              const s = sale as Record<string, never>;
              const type = s.type as string;
              const r = await saveSale({ id: s.id || undefined, name: s.name, badge: s.badge || null, type, value: type === "percent" ? Number(s.value) : type === "min_price" ? 1 : toP(s.value), scope: s.scope, targetIds: s.targetIds, startsAt: fromLocal(s.starts), endsAt: s.noEnd ? NO_END : fromLocal(s.ends), showBanner: s.banner, active: s.active });
              after(r, () => setSale(null));
            }}>
              <F id="sn" label="Sale name"><input id="sn" className="input" required placeholder="Diwali Dhamaka" value={String(sale.name)} onChange={(e) => setSale({ ...sale, name: e.target.value })} /></F>
              <F id="st" label="Discount type"><select id="st" className="input" value={String(sale.type)} onChange={(e) => setSale({ ...sale, type: e.target.value })}><option value="percent">% off</option><option value="flat">₹ off each item</option><option value="min_price">Drop to each size&apos;s minimum price</option></select></F>
              {sale.type === "min_price"
                ? <p className="self-end text-xs text-ink-soft">Each size sells at the “Min price” set on its listing. Sizes without one keep their normal price.</p>
                : <F id="sv" label={sale.type === "percent" ? "Percent off" : "₹ off"}><input id="sv" className="input" type="number" min="1" required value={String(sale.value)} onChange={(e) => setSale({ ...sale, value: e.target.value })} /></F>}
              <F id="ss" label="Starts"><input id="ss" className="input" type="datetime-local" required value={String(sale.starts)} onChange={(e) => setSale({ ...sale, starts: e.target.value })} /></F>
              <div><F id="se" label="Ends">{sale.noEnd ? <p className="input bg-line/40 text-ink-soft">No end date</p> : <input id="se" className="input" type="datetime-local" required value={String(sale.ends)} onChange={(e) => setSale({ ...sale, ends: e.target.value })} />}</F>
                <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" className="size-3.5 accent-ink" checked={Boolean(sale.noEnd)} onChange={(e) => setSale({ ...sale, noEnd: e.target.checked })} /> No end date (runs until you turn it off, no countdown)</label></div>
              <F id="sc" label="Applies to"><select id="sc" className="input" value={String(sale.scope)} onChange={(e) => setSale({ ...sale, scope: e.target.value, targetIds: [] })}><option value="all">Whole store</option><option value="category">Whole categories</option><option value="brand">Whole brands</option><option value="products">Single listings</option></select></F>
              {sale.scope !== "all" && (
                <fieldset className="max-h-64 overflow-y-auto rounded-sm border border-line bg-white p-2 sm:col-span-3"><legend className="px-1 text-xs font-medium">Choose ({(sale.targetIds as string[]).length} selected)</legend>
                  {sale.scope === "products" && <input aria-label="Search listings" className="input mb-2" placeholder="Search listings" value={String(sale.q ?? "")} onChange={(e) => setSale({ ...sale, q: e.target.value })} />}
                  <div className="grid gap-1 sm:grid-cols-2">{(sale.scope === "category" ? categories : sale.scope === "brand" ? brands : products.filter((o) => (sale.targetIds as string[]).includes(o.id) || o.name.toLowerCase().includes(String(sale.q ?? "").toLowerCase()))).map((o) => {
                    const ids = sale.targetIds as string[];
                    return <label key={o.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink" checked={ids.includes(o.id)} onChange={(e) => setSale({ ...sale, targetIds: e.target.checked ? [...ids, o.id] : ids.filter((x) => x !== o.id) })} />{o.name}</label>;
                  })}</div>
                </fieldset>
              )}
              <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" className="size-4 accent-ink" checked={Boolean(sale.active)} onChange={(e) => setSale({ ...sale, active: e.target.checked })} /> On</label>
              <div className="flex gap-2 sm:col-span-3"><button className="btn btn-ink btn-sm">Save sale</button><button type="button" className="btn btn-white btn-sm" onClick={() => setSale(null)}>Cancel</button></div>
            </form>
          )}
          {sales.length ? <ul>{sales.map((s) => (
            <Row key={s.id} title={s.name} badge={<Badge r={s} />} sub={`${s.type === "min_price" ? "Minimum prices" : `${s.type === "percent" ? `${s.value}%` : money(s.value)} off`} · ${s.scope === "all" ? "whole store" : `${s.targetIds.length} ${s.scope === "category" ? "categories" : s.scope === "brand" ? (s.targetIds.length === 1 ? "brand" : "brands") : "listings"}`} · ${isOpenEnded(s.endsAt) ? `from ${formatDateTime(s.startsAt)}, no end date` : `${formatDateTime(s.startsAt)} to ${formatDateTime(s.endsAt)}`}`}
              onEdit={() => setSale({ id: s.id, name: s.name, badge: s.badge ?? "", type: s.type, value: s.type === "percent" ? String(s.value) : rup(s.value), scope: s.scope, targetIds: s.targetIds, starts: toLocal(s.startsAt), ends: isOpenEnded(s.endsAt) ? toLocal(Date.now() + 7 * 86400000) : toLocal(s.endsAt), noEnd: isOpenEnded(s.endsAt), q: "", banner: s.showBanner, active: s.active })} onDelete={() => del("sale", s.id)} />
          ))}</ul> : <Empty>No sales yet.</Empty>}
        </Panel>
      )}

      {tab === "coupons" && (
        <Panel title="Coupons" actions={!coupon && <button className="btn btn-primary btn-sm" onClick={() => setCoupon({ code: "", description: "", type: "percent", value: "", min: "", max: "", starts: "", ends: "", limit: "", perCustomer: "", first: false, excludeSale: false, active: true })}><Plus size={14} aria-hidden /> New coupon</button>}>
          <p className="mb-3 text-sm text-ink-soft">A code customers type at checkout, like WELCOME10. Tap “Copy link” to share it on Instagram or WhatsApp: whoever opens the link gets the code applied for them.</p>
          {coupon && (
            <form className="mb-4 grid gap-3 rounded-sm bg-ivory p-3 sm:grid-cols-3" onSubmit={async (e) => {
              e.preventDefault();
              const c = coupon as Record<string, never>;
              const type = c.type as string;
              const r = await saveCoupon({ id: c.id || undefined, code: c.code, description: c.description || null, type, value: type === "percent" ? Number(c.value) : type === "flat" ? toP(c.value) : 0, minSubtotal: toP(c.min), maxDiscount: optP(c.max), startsAt: fromLocal(c.starts), endsAt: fromLocal(c.ends), usageLimit: optI(c.limit), perCustomerLimit: optI(c.perCustomer), firstOrderOnly: c.first, excludeSaleItems: c.excludeSale, active: c.active });
              after(r, () => setCoupon(null));
            }}>
              <F id="cc" label="Code"><input id="cc" className="input font-mono uppercase" required value={String(coupon.code)} onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })} /></F>
              <F id="ct" label="Type"><select id="ct" className="input" value={String(coupon.type)} onChange={(e) => setCoupon({ ...coupon, type: e.target.value })}><option value="percent">% off</option><option value="flat">₹ off</option><option value="free_shipping">Free delivery</option></select></F>
              {coupon.type !== "free_shipping" && <F id="cv" label={coupon.type === "percent" ? "Percent off" : "₹ off"}><input id="cv" className="input" type="number" min="1" required value={String(coupon.value)} onChange={(e) => setCoupon({ ...coupon, value: e.target.value })} /></F>}
              <F id="cd" label="Short line for the Offers page (optional)"><input id="cd" className="input" value={String(coupon.description)} onChange={(e) => setCoupon({ ...coupon, description: e.target.value })} /></F>
              <F id="cm" label="Minimum cart ₹"><input id="cm" className="input" type="number" min="0" value={String(coupon.min)} onChange={(e) => setCoupon({ ...coupon, min: e.target.value })} /></F>
              {coupon.type === "percent" && <F id="cx" label="Biggest discount allowed ₹ (optional)"><input id="cx" className="input" type="number" min="1" value={String(coupon.max)} onChange={(e) => setCoupon({ ...coupon, max: e.target.value })} /></F>}
              <F id="cs" label="Starts (optional)"><input id="cs" className="input" type="datetime-local" value={String(coupon.starts)} onChange={(e) => setCoupon({ ...coupon, starts: e.target.value })} /></F>
              <F id="ce" label="Ends (optional)"><input id="ce" className="input" type="datetime-local" value={String(coupon.ends)} onChange={(e) => setCoupon({ ...coupon, ends: e.target.value })} /></F>
              <F id="cl" label="How many times in total (optional)"><input id="cl" className="input" type="number" min="1" value={String(coupon.limit)} onChange={(e) => setCoupon({ ...coupon, limit: e.target.value })} /></F>
              <F id="cp" label="Times each customer can use it (optional)"><input id="cp" className="input" type="number" min="1" value={String(coupon.perCustomer)} onChange={(e) => setCoupon({ ...coupon, perCustomer: e.target.value })} /></F>
              <div className="space-y-1 sm:col-span-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink" checked={Boolean(coupon.first)} onChange={(e) => setCoupon({ ...coupon, first: e.target.checked })} /> First order only</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink" checked={Boolean(coupon.excludeSale)} onChange={(e) => setCoupon({ ...coupon, excludeSale: e.target.checked })} /> Don&apos;t apply to items already on sale</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink" checked={Boolean(coupon.active)} onChange={(e) => setCoupon({ ...coupon, active: e.target.checked })} /> On</label>
              </div>
              <div className="flex gap-2 sm:col-span-3"><button className="btn btn-ink btn-sm">Save coupon</button><button type="button" className="btn btn-white btn-sm" onClick={() => setCoupon(null)}>Cancel</button></div>
            </form>
          )}
          {coupons.length ? <ul>{coupons.map((c) => (
            <Row key={c.id} title={c.code} badge={<Badge r={c} />} sub={`${c.type === "percent" ? `${c.value}% off` : c.type === "flat" ? `${money(c.value)} off` : "Free delivery"}${c.minSubtotal ? ` · min ${money(c.minSubtotal)}` : ""} · used ${c.usedCount}${c.usageLimit ? `/${c.usageLimit}` : ""}${c.firstOrderOnly ? " · first order" : ""}`}
              extra={<button className="btn btn-white btn-sm" onClick={async () => { await navigator.clipboard?.writeText(`${window.location.origin}/shop?coupon=${c.code}&utm_source=instagram&utm_campaign=${c.code}`).catch(() => {}); setCopied(c.code); setTimeout(() => setCopied(""), 1500); }}>{copied === c.code ? <Check size={14} aria-hidden /> : <Link2 size={14} aria-hidden />} Copy link</button>}
              onEdit={() => setCoupon({ id: c.id, code: c.code, description: c.description ?? "", type: c.type, value: c.type === "percent" ? String(c.value) : rup(c.value), min: rup(c.minSubtotal), max: rup(c.maxDiscount), starts: toLocal(c.startsAt), ends: toLocal(c.endsAt), limit: c.usageLimit?.toString() ?? "", perCustomer: c.perCustomerLimit?.toString() ?? "", first: c.firstOrderOnly, excludeSale: c.excludeSaleItems, active: c.active })} onDelete={() => del("coupon", c.id)} />
          ))}</ul> : <Empty>No coupons yet.</Empty>}
        </Panel>
      )}
    </div>
  );
}
