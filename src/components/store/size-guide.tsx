"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Ruler, X } from "lucide-react";

export type SizeTable = { title: string; columns: string[]; rows: string[][] };

/** Size tables, readable on a phone: sticky first column, scrolls sideways only inside the table. */
export function SizeTables({ tables, highlight }: { tables: SizeTable[]; highlight?: string }) {
  return (
    <div className="space-y-5">
      {tables.map((t) => (
        <div key={t.title}>
          {t.title && <p className="mb-2 text-[13px] font-bold tracking-[0.08em] uppercase">{t.title}</p>}
          <div className="overflow-x-auto rounded-sm border border-line">
            <table className="w-full min-w-max border-collapse text-sm tabular-nums">
              <thead><tr className="bg-sand-soft">{t.columns.map((c, i) => <th key={i} scope="col" className={`px-3 py-2 text-left text-xs font-bold whitespace-nowrap ${i === 0 ? "sticky left-0 bg-sand-soft" : ""}`}>{c}</th>)}</tr></thead>
              <tbody>
                {t.rows.map((r, ri) => {
                  // The row whose size matches the pick: "S" for "S (80 cm)", "45" for "2–3 Y (45 cm)".
                  const k = r[0]?.trim();
                  const on = Boolean(highlight && k && (highlight === k || highlight.startsWith(`${k} `) || highlight.includes(`(${k} cm)`) || highlight.includes(`(${k})`)));
                  return (
                    <tr key={ri} className={`border-t border-line ${on ? "bg-pine-soft font-semibold" : ri % 2 ? "bg-ivory/60" : "bg-white"}`}>
                      {r.map((c, ci) => ci === 0
                        ? <th key={ci} scope="row" className={`sticky left-0 px-3 py-2 text-left font-bold whitespace-nowrap ${on ? "bg-pine-soft" : ri % 2 ? "bg-ivory" : "bg-white"}`}>{c}</th>
                        : <td key={ci} className="px-3 py-2 whitespace-nowrap">{c}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/** "Size guide" link beside the sizes: opens the tables, the brand's chart photo and a fit tip. */
export function SizeGuideButton({ tables, note, charts, selected, name }: { tables: SizeTable[]; note: string | null; charts: { url: string; alt: string | null }[]; selected?: string; name: string }) {
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", key); };
  }, [open]);
  if (!tables.length && !note && !charts.length) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2" data-testid="size-guide-open"><Ruler size={14} aria-hidden /> Size guide</button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-label={`Size guide for ${name}`} className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg bg-white sm:max-w-2xl sm:rounded-lg" data-testid="size-guide">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="flex items-center gap-2 font-display text-2xl"><Ruler size={20} aria-hidden /> Size guide</p>
              <button ref={close} type="button" onClick={() => setOpen(false)} aria-label="Close size guide" className="grid size-11 place-items-center"><X size={22} /></button>
            </div>
            <div className="space-y-5 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {selected && <p className="text-sm">Your pick, <b>{selected}</b>, is highlighted.</p>}
              {tables.length > 0 && <SizeTables tables={tables} highlight={selected} />}
              {note && <p className="text-sm text-ink-soft">{note}</p>}
              <p className="rounded-sm bg-sand-soft p-3 text-sm"><b>Between sizes?</b> Thermals fit close to the body. Go one size up for kids who are growing fast or if you prefer a looser fit.</p>
              {charts.map((c) => (
                <div key={c.url}>
                  <p className="mb-1 text-xs font-semibold text-ink-soft">From the brand</p>
                  <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-line bg-white"><Image src={c.url} alt={c.alt ?? "Size chart"} fill sizes="(max-width:640px) 100vw, 640px" className="object-contain" /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
