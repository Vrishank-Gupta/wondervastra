"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Baby, Plus, ShoppingBag, Trash2, User } from "lucide-react";
import { useCart } from "./cart-context";
import { useQuote } from "./use-quote";
import { track } from "./tracker";
import { money } from "@/lib/format";

type Choice = { pick: string; size: string; ids: string[]; pieces: number; price: number; mrp: number; stock: number };
type P = { id: string; slug: string; name: string; kids: boolean; image: string | null; minPieces: number; sizes: string[]; picks: string[]; choices: Choice[] };
type Row = { key: number; kid: boolean; name: string; productId: string; pick: string; size: string };

let rowSeq = 0;
const shortPick = (p: string) => p.replace(/^Set \((.*)\)$/, "Set: $1");

/** One row per family member: who, which thermal, set or piece, and size. Everything goes to the cart together. */
export function FamilyPack({ products, tiers }: { products: P[]; tiers: { pieces: number; reward: string }[] }) {
  const router = useRouter();
  const { add } = useCart();
  const kids = products.filter((p) => p.kids), adults = products.filter((p) => !p.kids);
  const firstPick = (p?: P) => p?.picks[0] ?? "";
  const blank = (kid: boolean, name = ""): Row => {
    const p = (kid ? kids : adults)[0];
    return { key: ++rowSeq, kid, name, productId: p?.id ?? "", pick: firstPick(p), size: "" };
  };
  const [rows, setRows] = useState<Row[]>(() => [blank(false, ""), blank(true, "")].filter((r) => r.productId));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const chosen = rows.map((r) => {
    const p = products.find((x) => x.id === r.productId);
    const c = p?.choices.find((x) => x.pick === r.pick && x.size === r.size) ?? null;
    return { r, p, c };
  });
  const items = useMemo(() => {
    const m = new Map<string, number>();
    for (const { c } of chosen) if (c && c.stock > 0) for (const id of c.ids) m.set(id, (m.get(id) ?? 0) + 1);
    return [...m].map(([variantId, qty]) => ({ variantId, qty }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(chosen.map((x) => x.c?.ids ?? null))]);
  const { quote, loading } = useQuote(items, { enabled: items.length > 0 });
  const pieces = items.reduce((a, i) => a + i.qty, 0);
  const next = tiers.find((t) => t.pieces > pieces);
  const reached = [...tiers].reverse().find((t) => t.pieces <= pieces);
  const missing = chosen.filter(({ c }) => !c).length;

  const addAll = () => {
    setTried(true);
    if (missing || !items.length) return;
    setBusy(true);
    for (const i of items) add(i.variantId, i.qty, { open: false });
    track("family_pack", `${rows.length} people · ${pieces} pieces`);
    router.push("/cart");
  };

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]" data-testid="family-pack">
      <div className="space-y-3">
        {chosen.map(({ r, p, c }, i) => {
          const list = r.kid ? kids : adults;
          const choiceFor = (size: string) => p?.choices.find((x) => x.pick === r.pick && x.size === size);
          return (
            <fieldset key={r.key} className="rounded-sm border border-line bg-white p-3 sm:p-4" data-testid="pack-row">
              <legend className="sr-only">Person {i + 1}</legend>
              <div className="flex items-start gap-3">
                <div className="relative hidden h-24 w-20 shrink-0 overflow-hidden rounded-sm border border-line bg-white sm:block">
                  {p?.image && <Image src={p.image} alt="" fill sizes="80px" className="object-contain" />}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex overflow-hidden rounded-sm border border-line" role="group" aria-label={`Person ${i + 1} is`}>
                      {[false, true].map((kid) => (
                        <button key={String(kid)} type="button" aria-pressed={r.kid === kid} disabled={!(kid ? kids : adults).length}
                          className={`flex min-h-10 items-center gap-1.5 px-3 text-sm font-medium ${r.kid === kid ? "bg-ink text-white" : "bg-white"}`}
                          onClick={() => { const np = (kid ? kids : adults)[0]; set(r.key, { kid, productId: np?.id ?? "", pick: firstPick(np), size: "" }); }}>
                          {kid ? <Baby size={15} aria-hidden /> : <User size={15} aria-hidden />}{kid ? "Kid" : "Adult"}
                        </button>
                      ))}
                    </div>
                    <input aria-label={`Person ${i + 1} name (optional)`} placeholder={r.kid ? "Name (optional), e.g. Aarav" : "Name (optional), e.g. Papa"} className="input min-w-0 flex-1 py-2" value={r.name} maxLength={30} onChange={(e) => set(r.key, { name: e.target.value })} />
                    {rows.length > 1 && <button type="button" aria-label={`Remove person ${i + 1}`} className="grid size-10 place-items-center text-ink-soft hover:text-clay" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 size={17} /></button>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label text-xs" htmlFor={`fp-p-${r.key}`}>Thermal</label>
                      <select id={`fp-p-${r.key}`} className="input" value={r.productId} onChange={(e) => { const np = products.find((x) => x.id === e.target.value); set(r.key, { productId: e.target.value, pick: np?.picks.includes(r.pick) ? r.pick : firstPick(np), size: np?.sizes.includes(r.size) ? r.size : "" }); }}>
                        {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs" htmlFor={`fp-s-${r.key}`}>Size</label>
                      <select id={`fp-s-${r.key}`} className={`input ${tried && !c ? "border-clay" : ""}`} value={r.size} onChange={(e) => set(r.key, { size: e.target.value })} aria-invalid={tried && !c}>
                        <option value="">Choose size</option>
                        {p?.sizes.map((s) => { const x = choiceFor(s); return <option key={s} value={s} disabled={!x || x.stock <= 0}>{s}{!x || x.stock <= 0 ? " (sold out)" : ""}</option>; })}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Set or single piece">
                    {p?.picks.map((pk) => {
                      const any = p.choices.some((x) => x.pick === pk && x.stock > 0);
                      return <button key={pk} type="button" aria-pressed={r.pick === pk} disabled={!any}
                        className={`min-h-10 rounded-sm border px-3 text-sm ${r.pick === pk ? "border-ink bg-ink text-white" : "border-line bg-white"} disabled:opacity-40`}
                        onClick={() => set(r.key, { pick: pk, size: p.choices.some((x) => x.pick === pk && x.size === r.size && x.stock > 0) ? r.size : "" })}>{shortPick(pk)}</button>;
                    })}
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    {p && <Link href={`/p/${p.slug}`} className="text-ink-soft underline" target="_blank">Photos and size guide</Link>}
                    {c ? <span><b className="text-base">{money(c.price)}</b>{c.mrp > c.price && <s className="ml-1.5 text-ink-soft">{money(c.mrp)}</s>} <span className="text-ink-soft">· {c.pieces} {c.pieces === 1 ? "piece" : "pieces"}</span></span>
                      : <span className={tried ? "font-medium text-clay" : "text-ink-soft"}>Choose a size</span>}
                  </div>
                </div>
              </div>
            </fieldset>
          );
        })}
        <div className="flex flex-wrap gap-2">
          {adults.length > 0 && <button type="button" className="btn btn-white" onClick={() => setRows((rs) => [...rs, blank(false)])}><Plus size={16} aria-hidden /> Add an adult</button>}
          {kids.length > 0 && <button type="button" className="btn btn-white" onClick={() => setRows((rs) => [...rs, blank(true)])}><Plus size={16} aria-hidden /> Add a kid</button>}
        </div>
      </div>

      <aside className="lg:sticky lg:top-32 lg:self-start">
        <div className="card-pop space-y-3 p-4">
          <p className="font-display text-2xl">Your family pack</p>
          <p className="text-sm">{rows.length} {rows.length === 1 ? "person" : "people"} · <b>{pieces} {pieces === 1 ? "piece" : "pieces"}</b></p>
          {tiers.length > 0 && (
            <ol className="flex gap-1.5" aria-label="Extra savings by pieces">
              {tiers.map((t) => <li key={t.pieces} className={`flex-1 rounded-sm border px-1 py-1.5 text-center text-xs ${pieces >= t.pieces ? "border-pine bg-pine-soft font-bold" : "border-line"}`}>{t.pieces} pcs<br />{t.reward.replace(/ off.*$/, "")}</li>)}
            </ol>
          )}
          <p className="text-sm" role="status">
            {reached ? <><b>{reached.reward.replace(/ off.*$/, "")} extra off</b> unlocked. </> : null}
            {next ? <>Add {next.pieces - pieces} more {next.pieces - pieces === 1 ? "piece" : "pieces"} for {next.reward.replace(/ off.*$/, "")} extra off.</> : null}
          </p>
          {quote && items.length > 0 && (
            <dl className={`space-y-1.5 border-t border-line pt-3 text-sm ${loading ? "opacity-60" : ""}`}>
              <div className="flex justify-between"><dt>Items</dt><dd>{money(quote.subtotal)}</dd></div>
              {(quote.offer?.discount ?? 0) > 0 && <div className="flex justify-between text-pine"><dt>Extra savings</dt><dd>−{money(quote.offer!.discount)}</dd></div>}
              <div className="flex justify-between"><dt>Delivery</dt><dd>Free</dd></div>
              <div className="flex justify-between border-t border-line pt-1.5 text-base font-bold"><dt>Total</dt><dd data-testid="pack-total">{money(quote.total)}</dd></div>
            </dl>
          )}
          {tried && missing > 0 && <p role="alert" className="rounded-sm bg-clay-soft p-2.5 text-sm font-medium">Choose a size for {missing === 1 ? "1 person" : `${missing} people`}.</p>}
          {quote?.minimumIssue && !missing && <p role="alert" className="rounded-sm bg-clay-soft p-2.5 text-sm font-medium">{quote.minimumIssue}</p>}
          <button type="button" className="btn btn-primary w-full text-lg" disabled={busy} onClick={addAll} data-testid="pack-add"><ShoppingBag size={18} aria-hidden /> Add all to cart</button>
          <p className="text-center text-xs text-ink-soft">Free delivery · You can change anything in the cart</p>
        </div>
      </aside>
    </div>
  );
}
