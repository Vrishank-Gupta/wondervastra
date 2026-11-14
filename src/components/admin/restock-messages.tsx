"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { markAlertMessaged } from "@/app/admin/actions";

export type ToMessage = { id: string; phone: string; product: string; url: string; size: string | null };

/** Back in stock, but the buyer left only a phone number and WhatsApp isn't connected: one tap opens the chat, then mark it sent. */
export function RestockMessages({ rows }: { rows: ToMessage[] }) {
  const router = useRouter();
  const [opened, setOpened] = useState<string[]>([]);
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((r) => {
        const text = `Hi! ${r.product}${r.size ? ` in size ${r.size}` : ""} is back in stock at WonderVastra: ${r.url}`;
        return (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0"><b className="block">{r.phone}</b><span className="text-xs text-ink-soft">{r.product}{r.size ? ` · ${r.size}` : ""}</span></span>
            <span className="flex gap-2">
              <a className="btn btn-white btn-sm" href={`https://wa.me/91${r.phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" onClick={() => setOpened([...opened, r.id])}><MessageCircle size={14} aria-hidden /> Message</a>
              <button className={`btn btn-sm ${opened.includes(r.id) ? "btn-ink" : "btn-white"}`} onClick={async () => { await markAlertMessaged(r.id); router.refresh(); }}><Check size={14} aria-hidden /> Sent</button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
