"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { SlidersHorizontal, X } from "lucide-react";

export type FacetData = { brands: { slug: string; name: string }[]; colors: { name: string; hex: string | null }[]; sizes: string[]; maxPrice: number };

const PRICES = [
  { label: "Under ₹300", max: 30000 },
  { label: "₹300 – ₹600", min: 30000, max: 60000 },
  { label: "₹600 – ₹1,000", min: 60000, max: 100000 },
  { label: "Above ₹1,000", min: 100000 },
];
const SORTS = [
  { value: "", label: "Recommended" },
  { value: "new", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "discount", label: "Biggest discount" },
  { value: "rating", label: "Top rated" },
];

/**
 * Filters live in the URL (shareable, back-button friendly). The controls update instantly (optimistic)
 * while the filtered results load, so a tap never looks ignored on a slow connection.
 */
function useParamsEditor() {
  const router = useRouter();
  const pathname = usePathname();
  const real = useSearchParams();
  const [params, setOptimistic] = useOptimistic(real as unknown as URLSearchParams, (_: URLSearchParams, next: URLSearchParams) => next);
  const [pending, start] = useTransition();
  const go = (next: URLSearchParams) => start(() => { setOptimistic(next); router.push(`${pathname}?${next.toString()}`, { scroll: false }); });
  return {
    params,
    pending,
    set(patch: Record<string, string | null>) {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
      go(next);
    },
    clear() {
      const next = new URLSearchParams();
      // Search terms, the brand page's category tab and the age shortcut aren't filters, so they survive "Clear".
      for (const k of ["q", "category", "collection"]) { const v = params.get(k); if (v) next.set(k, v); }
      go(next);
    },
  };
}

function FilterGroups({ facets }: { facets: FacetData }) {
  const { params, set, pending } = useParamsEditor();
  const check = "flex cursor-pointer items-center gap-2 py-1 text-sm";
  const toggle = (k: string) => (
    <input type="checkbox" className="size-4 accent-ink" checked={params.get(k) === "1"} onChange={(e) => set({ [k]: e.target.checked ? "1" : null })} />
  );
  return (
    <div className="space-y-5" aria-busy={pending}>
      <p className={`text-xs font-medium text-ink-soft ${pending ? "" : "invisible"}`} role="status">{pending ? "Updating results…" : "Results up to date"}</p>
      <fieldset>
        <legend className="mb-1.5 font-sans text-sm font-medium">Availability & deals</legend>
        <label className={check}>{toggle("inStock")} In stock only</label>
        <label className={check}>{toggle("onSale")} On discount</label>
        <label className={check}>{toggle("freeDelivery")} Free delivery</label>
      </fieldset>
      {facets.brands.length > 1 && (
        <fieldset>
          <legend className="mb-1.5 font-sans text-sm font-medium">Brand</legend>
          {facets.brands.map((b) => {
            const chosen = params.get("brand")?.split(",").filter(Boolean) ?? [];
            const on = chosen.includes(b.slug);
            return (
              <label key={b.slug} className={check}>
                <input type="checkbox" className="size-4 accent-ink" checked={on} onChange={() => {
                  const next = on ? chosen.filter((x) => x !== b.slug) : [...chosen, b.slug];
                  set({ brand: next.length ? next.join(",") : null });
                }} />
                {b.name}
              </label>
            );
          })}
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-1.5 font-sans text-sm font-medium">Price</legend>
        {PRICES.map((p) => {
          const active = params.get("min") === (p.min?.toString() ?? null) && params.get("max") === (p.max?.toString() ?? null);
          return (
            <label key={p.label} className={check}>
              <input type="radio" name="price" className="size-4 accent-ink" checked={active} onChange={() => set({ min: p.min?.toString() ?? null, max: p.max?.toString() ?? null })} />
              {p.label}
            </label>
          );
        })}
      </fieldset>
      {facets.colors.length > 0 && (
        <fieldset>
          <legend className="mb-2 font-sans text-sm font-medium">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {facets.colors.map((c) => {
              const on = params.get("color") === c.name;
              return (
                <button key={c.name} type="button" aria-pressed={on} aria-label={c.name} title={c.name} onClick={() => set({ color: on ? null : c.name })}
                  className={`size-7 rounded-full border ${on ? "border-ink ring-1 ring-ink ring-offset-2" : "border-ink/15"}`} style={{ background: c.hex ?? "#ddd" }} />
              );
            })}
          </div>
        </fieldset>
      )}
      {facets.sizes.length > 0 && (
        <fieldset>
          <legend className="mb-2 font-sans text-sm font-medium">Size</legend>
          <div className="flex flex-wrap gap-1.5">
            {facets.sizes.map((s) => {
              const on = params.get("size") === s;
              return <button key={s} type="button" aria-pressed={on} onClick={() => set({ size: on ? null : s })} className={`rounded-xs border px-3 py-1.5 text-xs ${on ? "border-ink bg-ink text-ivory" : "border-line hover:border-ink"}`}>{s}</button>;
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}

export function SortSelect() {
  const { params, set } = useParamsEditor();
  return (
    <select aria-label="Sort products" value={params.get("sort") ?? ""} onChange={(e) => set({ sort: e.target.value || null })} className="rounded-xs border border-line bg-transparent px-3 py-2 text-sm">
      {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );
}

export function DesktopFilters({ facets }: { facets: FacetData }) {
  const { params, clear } = useParamsEditor();
  const active = ["brand", "inStock", "onSale", "freeDelivery", "min", "max", "color", "size"].some((k) => params.get(k));
  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <div className="sticky top-32">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg">Filters</h2>
          {active && <button onClick={clear} className="text-xs font-medium underline">Clear all</button>}
        </div>
        <FilterGroups facets={facets} />
      </div>
    </aside>
  );
}

export function MobileFilters({ facets, count }: { facets: FacetData; count: number }) {
  const [open, setOpen] = useState(false);
  const { params, clear } = useParamsEditor();
  const n = ["brand", "inStock", "onSale", "freeDelivery", "color", "size"].filter((k) => params.get(k)).length + (params.get("min") || params.get("max") ? 1 : 0);
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xs border border-line bg-transparent px-3 py-2 text-sm lg:hidden">
        <SlidersHorizontal size={15} aria-hidden /> Filters{n > 0 && <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-ivory">{n}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col bg-ivory">
            <div className="flex items-center justify-between border-b border-line p-4">
              <h2 className="text-xl">Filters</h2>
              <button aria-label="Close filters" onClick={() => setOpen(false)} className="-mr-2 grid size-10 place-items-center"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><FilterGroups facets={facets} /></div>
            <div className="flex gap-2 border-t border-line p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
              <button onClick={clear} className="btn btn-white flex-1">Clear</button>
              <button onClick={() => setOpen(false)} className="btn btn-primary flex-[2]">Show {count} items</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
