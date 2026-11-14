"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { bulkSetProductStatus } from "@/app/admin/actions";

/**
 * Tick boxes in the listings table (form="bulk") feed this bar: publish, unpublish or archive many listings at once.
 */
export function ListingBulkBar() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [count, setCount] = useState(0);
  const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[form="bulk"][name="ids"]'));
  // The tick boxes live in the table, outside this bar, so listen at the document.
  useEffect(() => {
    const onChange = (e: Event) => { if ((e.target as HTMLElement).matches?.('input[form="bulk"][name="ids"]')) setCount(boxes().filter((b) => b.checked).length); };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);
  async function run(status: "active" | "draft" | "archived") {
    const ids = boxes().filter((b) => b.checked).map((b) => b.value);
    setBusy(true); setMsg(null);
    const r = await bulkSetProductStatus(ids, status);
    setBusy(false);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.message ?? "Done." });
    boxes().forEach((b) => (b.checked = false)); setCount(0);
    router.refresh();
  }
  return (
    <form id="bulk" className="mb-3 flex flex-wrap items-center gap-2 rounded-sm border border-line bg-white px-3 py-2 text-sm"
      onSubmit={(e) => e.preventDefault()}>
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" className="size-4 accent-ink" aria-label="Select all listings" checked={count > 0 && count === boxes().length}
          onChange={(e) => { boxes().forEach((b) => (b.checked = e.target.checked)); setCount(e.target.checked ? boxes().length : 0); }} />
        {count ? `${count} selected` : "Select all"}
      </label>
      <span className="flex-1" />
      <button type="button" disabled={!count || busy} className="btn btn-primary btn-sm" onClick={() => run("active")}>{busy && <Loader2 size={14} className="animate-spin" aria-hidden />}Publish selected</button>
      <button type="button" disabled={!count || busy} className="btn btn-white btn-sm" onClick={() => run("draft")}>Unpublish</button>
      <button type="button" disabled={!count || busy} className="btn btn-white btn-sm" onClick={() => run("archived")}>Archive</button>
      {msg && <p className={`w-full rounded-sm p-2 font-medium ${msg.ok ? "bg-pine-soft" : "bg-clay-soft"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </form>
  );
}
