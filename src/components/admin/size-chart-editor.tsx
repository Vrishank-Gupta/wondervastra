"use client";
import { Plus, Trash2 } from "lucide-react";

export type SizeTable = { title: string; columns: string[]; rows: string[][] };

/** Type the size chart like a spreadsheet: a title, column names, and one row per size. */
export function SizeChartEditor({ value, onChange, sizes }: { value: SizeTable[]; onChange: (v: SizeTable[]) => void; sizes: string[] }) {
  const set = (ti: number, t: SizeTable) => onChange(value.map((x, i) => (i === ti ? t : x)));
  const starter = (): SizeTable => ({ title: "", columns: ["Size", "Age", "Chest (cm)", "Waist (cm)"], rows: sizes.map((s) => [s, "", "", ""]) });
  return (
    <div className="space-y-3" data-testid="size-chart-editor">
      {value.map((t, ti) => (
        <div key={ti} className="space-y-2 rounded-sm border border-line bg-white p-2">
          <div className="flex gap-2">
            <input aria-label={`Table ${ti + 1} title`} className="input flex-1 py-1.5" placeholder="Title (optional), e.g. Top or Trouser" value={t.title} onChange={(e) => set(ti, { ...t, title: e.target.value })} />
            <button type="button" className="btn btn-white btn-sm" onClick={() => onChange(value.filter((_, i) => i !== ti))} aria-label={`Remove table ${ti + 1}`}><Trash2 size={14} /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead><tr>
                {t.columns.map((c, ci) => (
                  <th key={ci} className="p-0.5"><div className="flex items-center gap-0.5">
                    <input aria-label={`Column ${ci + 1} name`} className="input w-28 px-2 py-1 text-xs font-bold" value={c} onChange={(e) => set(ti, { ...t, columns: t.columns.map((x, i) => (i === ci ? e.target.value : x)) })} />
                    {t.columns.length > 1 && <button type="button" aria-label={`Remove column ${c || ci + 1}`} className="grid size-7 place-items-center text-ink-soft hover:text-clay" onClick={() => set(ti, { ...t, columns: t.columns.filter((_, i) => i !== ci), rows: t.rows.map((r) => r.filter((_, i) => i !== ci)) })}><Trash2 size={12} /></button>}
                  </div></th>
                ))}
                <th className="p-0.5"><button type="button" className="btn btn-white btn-sm" onClick={() => set(ti, { ...t, columns: [...t.columns, ""], rows: t.rows.map((r) => [...r, ""]) })}><Plus size={13} /> Column</button></th>
              </tr></thead>
              <tbody>
                {t.rows.map((r, ri) => (
                  <tr key={ri}>
                    {t.columns.map((_, ci) => <td key={ci} className="p-0.5"><input aria-label={`Row ${ri + 1}, ${t.columns[ci] || `column ${ci + 1}`}`} className="input w-28 px-2 py-1" value={r[ci] ?? ""} onChange={(e) => set(ti, { ...t, rows: t.rows.map((row, i) => (i === ri ? t.columns.map((__, k) => (k === ci ? e.target.value : row[k] ?? "")) : row)) })} /></td>)}
                    <td className="p-0.5"><button type="button" aria-label={`Remove row ${ri + 1}`} className="grid size-8 place-items-center text-ink-soft hover:text-clay" onClick={() => set(ti, { ...t, rows: t.rows.filter((_, i) => i !== ri) })}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-white btn-sm" onClick={() => set(ti, { ...t, rows: [...t.rows, t.columns.map(() => "")] })}><Plus size={13} /> Row</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {!value.length && <button type="button" className="btn btn-white btn-sm" onClick={() => onChange([starter()])} disabled={!sizes.length}>Start from my sizes</button>}
        <button type="button" className="btn btn-white btn-sm" onClick={() => onChange([...value, value.length ? { title: "", columns: [...value[0].columns], rows: [] } : starter()])}><Plus size={13} /> {value.length ? "Another table (e.g. Trouser)" : "Empty table"}</button>
      </div>
    </div>
  );
}
