"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveOfferLadder } from "@/app/admin/actions";
import type { schema } from "@/db";
import { money } from "@/lib/format";
import { Panel } from "./ui";

type Offer = typeof schema.cartOffers.$inferSelect;
type Step = { min: string; pct: string };

const SUGGESTED: Step[] = [{ min: "500", pct: "5" }, { min: "1000", pct: "7" }, { min: "2000", pct: "10" }, { min: "4000", pct: "12" }, { min: "5000", pct: "15" }];

/** "Shop ₹X more, get Y% off": the whole ladder on one screen, plus the free-delivery threshold. */
export function OfferLadder({ offers }: { offers: Offer[] }) {
  const router = useRouter();
  const pct = offers.filter((o) => o.type === "percent" && o.active && !o.endsAt).sort((a, b) => a.minPieces - b.minPieces || a.minSubtotal - b.minSubtotal);
  const [by, setBy] = useState<"pieces" | "value">(pct.some((o) => o.minPieces > 0) ? "pieces" : "value");
  const free = offers.find((o) => o.type === "free_shipping" && o.active && !o.endsAt);
  const [steps, setSteps] = useState<Step[]>(pct.length ? pct.map((o) => ({ min: String(o.minPieces || o.minSubtotal / 100), pct: String(o.value) })) : SUGGESTED);
  const [freeMode, setFreeMode] = useState<"never" | "always" | "above">(!free ? "never" : free.minSubtotal === 0 ? "always" : "above");
  const [freeMin, setFreeMin] = useState(free && free.minSubtotal ? String(free.minSubtotal / 100) : "799");
  const [combine, setCombine] = useState(pct[0]?.combinesWithCoupons ?? true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const others = offers.filter((o) => o.endsAt || o.type === "flat" || o.maxDiscount).length;

  const valid = steps.filter((s) => Number(s.min) > 0 && Number(s.pct) > 0).sort((a, b) => Number(a.min) - Number(b.min));
  const set = (i: number, k: keyof Step, v: string) => setSteps(steps.map((s, j) => (j === i ? { ...s, [k]: v.replace(/[^\d]/g, "") } : s)));

  return (
    <Panel title="Buy more, save more">
      <p className="mb-3 text-sm text-ink-soft">The more a customer buys, the bigger their discount. Each row is one step. Customers see “{by === "pieces" ? "Add 1 more piece to get 4% off" : "Add ₹230 more to get 10% off"}” in their cart. Remove all rows for no cart discount.</p>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setMsg(null);
        const r = await saveOfferLadder({
          by,
          steps: valid.map((s) => ({ min: by === "pieces" ? Math.floor(Number(s.min)) : Math.round(Number(s.min) * 100), percent: Math.floor(Number(s.pct)) })),
          freeDeliveryMin: freeMode === "never" ? null : freeMode === "always" ? 0 : Math.round(Number(freeMin || 0) * 100),
          combinesWithCoupons: combine,
        });
        setBusy(false);
        setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Saved. It's live on the store now." });
        if (!r.error) router.refresh();
      }}>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <legend className="label">Count the cart by</legend>
          <label className="flex items-center gap-2"><input type="radio" name="by" className="size-4 accent-ink" checked={by === "pieces"} onChange={() => { setBy("pieces"); setSteps([{ min: "3", pct: "3" }, { min: "4", pct: "4" }, { min: "5", pct: "5" }]); }} /> Number of pieces (“pick any 3”)</label>
          <label className="flex items-center gap-2"><input type="radio" name="by" className="size-4 accent-ink" checked={by === "value"} onChange={() => { setBy("value"); setSteps(SUGGESTED); }} /> Cart value in ₹</label>
        </fieldset>
        <div className="overflow-x-auto">
          <table className="w-full max-w-md text-sm [&_td]:py-1 [&_td]:pr-2">
            <thead><tr className="text-left text-xs text-ink-soft"><th className="pb-1 font-medium">{by === "pieces" ? "When the cart has at least" : "When the cart is at least"}</th><th className="pb-1 font-medium">Customer gets</th><th><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {steps.map((s, i) => (
                <tr key={i}>
                  <td><div className="flex items-center gap-1">{by === "value" && "₹"}<input aria-label={by === "pieces" ? `Step ${i + 1} pieces` : `Step ${i + 1} cart amount`} className={`input ${by === "pieces" ? "w-16" : "w-28"}`} inputMode="numeric" value={s.min} onChange={(e) => set(i, "min", e.target.value)} />{by === "pieces" && " pieces"}</div></td>
                  <td><div className="flex items-center gap-1"><input aria-label={`Step ${i + 1} percent off`} className="input w-20" inputMode="numeric" value={s.pct} onChange={(e) => set(i, "pct", e.target.value)} />% off</div></td>
                  <td><button type="button" aria-label={`Remove step ${i + 1}`} className="grid size-9 place-items-center hover:text-clay" onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {steps.length < 10 && <button type="button" className="btn btn-white btn-sm" onClick={() => { const last = valid[valid.length - 1]; setSteps([...steps, { min: last ? String(by === "pieces" ? Number(last.min) + 1 : Number(last.min) * 2) : by === "pieces" ? "3" : "500", pct: last ? String(Number(last.pct) + 2) : "5" }]); }}><Plus size={14} aria-hidden /> Add a step</button>}
        <fieldset className="space-y-1.5">
          <legend className="label">Free delivery</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="free" className="size-4 accent-ink" checked={freeMode === "above"} onChange={() => setFreeMode("above")} /> Free when the cart is at least
            <span className="inline-flex items-center gap-1">₹<input id="freemin" aria-label="Free delivery when the cart is at least ₹" className="input w-24 py-1" inputMode="numeric" value={freeMin} onFocus={() => setFreeMode("above")} onChange={(e) => setFreeMin(e.target.value.replace(/[^\d]/g, ""))} /></span></label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="free" className="size-4 accent-ink" checked={freeMode === "always"} onChange={() => setFreeMode("always")} /> Always free</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="free" className="size-4 accent-ink" checked={freeMode === "never"} onChange={() => setFreeMode("never")} /> No free delivery offer (each listing&apos;s own charge applies)</label>
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink" checked={combine} onChange={(e) => setCombine(e.target.checked)} /> Coupons can be used on top of these discounts</label>
        {valid.length > 0 && (
          <p className="rounded-sm bg-ivory p-2.5 text-xs"><b>Buyers will see:</b> {[...valid.map((s) => by === "pieces" ? `pick any ${s.min}, get ${s.pct}% off` : `${s.pct}% off above ${money(Number(s.min) * 100)}`), freeMode === "always" ? "free delivery on every order" : freeMode === "above" && Number(freeMin) ? `free delivery above ${money(Number(freeMin) * 100)}` : null].filter(Boolean).join(" · ") || "no cart discounts"}</p>
        )}
        {others > 0 && <p className="text-xs text-clay">Saving replaces all {offers.length} current cart offers, including {others} with an end date, a ₹ amount or a maximum discount, which the ladder doesn&apos;t have.</p>}
        {msg && <p className={`rounded-sm p-2.5 text-sm font-medium ${msg.ok ? "bg-pine-soft" : "bg-clay-soft"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
        <button disabled={busy} className="btn btn-primary btn-sm">Save discount ladder</button>
      </form>
    </Panel>
  );
}
