"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCcw, TrendingUp } from "lucide-react";
import { useCart } from "./cart-context";
import { track } from "./tracker";
import type { Reorder } from "@/lib/reorder";

/** "Order again" and, for kids' thermals, "Order again, one size up". Adds to the cart and opens it. */
export function ReorderBox({ data }: { data: Reorder }) {
  const router = useRouter();
  const { add } = useCart();
  const [open, setOpen] = useState(false);
  if (!data.same.length && !data.sizeUp.length) return null;
  const go = (lines: Reorder["same"], kind: string) => {
    for (const l of lines) add(l.variantId, l.qty, { open: false });
    track("reorder", kind);
    router.push("/cart");
  };
  const pcs = (lines: Reorder["same"]) => lines.reduce((a, l) => a + l.qty, 0);
  return (
    <section className="rounded-sm border border-line bg-white p-4" aria-label="Order again" data-testid="reorder">
      <p className="font-display text-xl">Need these again?</p>
      <p className="mt-1 text-sm text-ink-soft">
        {data.kids ? "Kids grow fast. Reorder the same thermals, or the same ones one size up." : "Reorder the same thermals in one tap."}
        {data.missing > 0 && ` ${data.missing === 1 ? "1 item is" : `${data.missing} items are`} sold out and left out.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.same.length > 0 && <button type="button" className="btn btn-white" onClick={() => go(data.same, "same")} data-testid="reorder-same"><RotateCcw size={16} aria-hidden /> Order again ({pcs(data.same)} pcs)</button>}
        {data.sizeUp.length > 0 && <button type="button" className="btn btn-primary" onClick={() => go(data.sizeUp, "size_up")} data-testid="reorder-up"><TrendingUp size={16} aria-hidden /> One size up ({pcs(data.sizeUp)} pcs)</button>}
        <button type="button" className="text-sm underline" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "See"} what gets added</button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          {data.same.length > 0 && <div><p className="font-bold">Order again</p><ul className="mt-1 space-y-0.5">{data.same.map((l) => <li key={l.variantId}>{l.qty} × {l.name}, {l.label}</li>)}</ul></div>}
          {data.sizeUp.length > 0 && <div><p className="font-bold">One size up</p><ul className="mt-1 space-y-0.5">{data.sizeUp.map((l) => <li key={l.variantId}>{l.qty} × {l.name}, {l.label}</li>)}</ul></div>}
        </div>
      )}
    </section>
  );
}
