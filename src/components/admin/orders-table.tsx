"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { bulkSetStatus } from "@/app/admin/actions";
import { formatDateTime, money } from "@/lib/format";
import { PayBadge, StatusBadge, Tbl } from "./ui";

type Row = { id: string; number: string; name: string; phone: string; status: string; paymentStatus: string; paymentMethod: string; total: number; createdAt: number; awb: string | null; source: string | null; qty: number };

export function OrdersTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const all = sel.length === rows.length;
  const run = async (next: "packed" | "delivered") => {
    setBusy(true);
    const r = await bulkSetStatus(sel, next);
    setMsg(r.message ?? r.error ?? "");
    setSel([]); setBusy(false);
    router.refresh();
  };
  return (
    <>
      {sel.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-sm bg-ink p-2 text-sm text-white">
          <b className="px-2">{sel.length} selected</b>
          <button disabled={busy} onClick={() => run("packed")} className="rounded-full bg-white px-3 py-1 font-medium text-ink">Mark packed</button>
          <button disabled={busy} onClick={() => run("delivered")} className="rounded-full bg-white px-3 py-1 font-medium text-ink">Mark delivered</button>
        </div>
      )}
      {msg && <p className="mb-2 text-sm font-medium" role="status">{msg}</p>}
      <Tbl>
        <thead><tr>
          <th><input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSel(all ? [] : rows.map((r) => r.id))} className="size-4 accent-ink" /></th>
          <th>Order</th><th>Date</th><th>Customer</th><th>Status</th><th>Payment</th><th className="text-right">Total</th><th>Pcs</th><th>AWB</th><th>Source</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-ivory">
              <td><input type="checkbox" aria-label={`Select ${r.number}`} className="size-4 accent-ink" checked={sel.includes(r.id)} onChange={() => setSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} /></td>
              <td><Link href={`/admin/orders/${r.id}`} className="font-mono text-xs font-medium underline">{r.number}</Link></td>
              <td className="text-xs whitespace-nowrap text-ink-soft">{formatDateTime(r.createdAt)}</td>
              <td className="whitespace-nowrap">{r.name}<span className="block text-xs text-ink-soft">{r.phone}</span></td>
              <td><StatusBadge status={r.status} /></td>
              <td><PayBadge status={r.paymentStatus} method={r.paymentMethod} /></td>
              <td className="text-right font-medium">{money(r.total)}</td>
              <td>{r.qty}</td>
              <td className="font-mono text-xs">{r.awb ?? "—"}</td>
              <td className="text-xs capitalize">{r.source ?? "direct"}</td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </>
  );
}
