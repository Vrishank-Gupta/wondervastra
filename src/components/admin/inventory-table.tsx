"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { bulkUpdateStock, setForceOutOfStock } from "@/app/admin/actions";
import { Tbl } from "./ui";

type Row = { id: string; productId: string; name: string; option1: string; option2: string; sku: string | null; stock: number; threshold: number; forceOut: boolean; waiting: number };

export function InventoryTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const shown = useMemo(() => rows.filter((r) => {
    if (q && !`${r.name} ${r.option1} ${r.option2} ${r.sku}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "out") return r.stock === 0 || r.forceOut;
    if (filter === "low") return r.stock <= r.threshold;
    return true;
  }), [rows, q, filter]);
  const changes = Object.entries(edits).filter(([id, v]) => v !== "" && Number(v) !== rows.find((r) => r.id === id)?.stock);
  return (
    <>
      <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-sm bg-ivory py-1 lg:top-0">
        <input aria-label="Search inventory" className="input min-w-44 flex-1 py-1.5" placeholder="Search name, size, colour, SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        {(["all", "low", "out"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{f === "all" ? "All" : f === "low" ? "Low stock" : "Out of stock"}</button>)}
        <button disabled={!changes.length || busy} className="btn btn-primary btn-sm" onClick={async () => {
          setBusy(true);
          const r = await bulkUpdateStock(changes.map(([variantId, v]) => ({ variantId, stock: Math.max(0, Math.floor(Number(v))) })));
          setBusy(false); setEdits({}); setMsg(r.message ?? r.error ?? ""); router.refresh();
        }}>Save {changes.length || ""} change{changes.length === 1 ? "" : "s"}</button>
      </div>
      {msg && <p className="mb-2 rounded-sm bg-pine-soft p-2 text-sm font-medium" role="status">{msg}</p>}
      <Tbl>
        <thead><tr><th>Listing</th><th>Variant</th><th>SKU</th><th>Stock</th><th>Waiting</th><th>Sale switch</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id} className="hover:bg-ivory">
              <td><Link className="font-medium hover:underline" href={`/admin/products/${r.productId}`}>{r.name}</Link></td>
              <td className="whitespace-nowrap">{r.option2 !== "Default" ? r.option2 : ""} {r.option1}</td>
              <td className="font-mono text-xs">{r.sku ?? "—"}</td>
              <td><input aria-label={`Stock for ${r.name} ${r.option2} ${r.option1}`} type="number" min="0" className={`w-20 rounded-sm border px-2 py-1 ${r.stock === 0 ? "border-clay" : r.stock <= r.threshold ? "border-sand" : "border-line"}`} value={edits[r.id] ?? r.stock} onChange={(e) => setEdits((x) => ({ ...x, [r.id]: e.target.value }))} /></td>
              <td>{r.waiting > 0 ? <b className="text-slate">{r.waiting} waiting</b> : "—"}</td>
              <td><label className="flex items-center gap-1.5 text-xs whitespace-nowrap"><input type="checkbox" className="size-4 accent-ink" checked={r.forceOut} onChange={async (e) => { const res = await setForceOutOfStock(r.productId, e.target.checked); setMsg(res.message ?? ""); router.refresh(); }} /> Marked out</label></td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </>
  );
}
