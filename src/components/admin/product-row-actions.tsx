"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Camera, Check, Copy, CopyPlus, MessageCircle, MoreHorizontal } from "lucide-react";
import { duplicateProduct, setForceOutOfStock, setProductStatus } from "@/app/admin/actions";

/** One tap gives a trackable link, so the dashboard can show which channel made the sale. */
export function ProductRowActions({ id, slug, name, status, forceOut, base }: { id: string; slug: string; name: string; status: string; forceOut: boolean; base: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const link = (src: string) => `${base}/p/${slug}?utm_source=${src}&utm_campaign=listing`;
  const copy = async (src: string) => { await navigator.clipboard?.writeText(link(src)).catch(() => {}); setCopied(src); setTimeout(() => setCopied(null), 1500); };
  const btn = "grid size-8 place-items-center rounded-sm border border-line bg-white hover:bg-sand-soft";
  return (
    <div className="flex items-center gap-1">
      <button className={btn} title="Copy Instagram link" aria-label={`Copy Instagram link for ${name}`} onClick={() => copy("instagram")}>{copied === "instagram" ? <Check size={15} /> : <Camera size={15} />}</button>
      <a className={btn} title="Share on WhatsApp" aria-label={`Share ${name} on WhatsApp`} target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${name}\n${link("whatsapp")}`)}`}><MessageCircle size={15} /></a>
      <button className={btn} title="Copy plain link" aria-label={`Copy link for ${name}`} onClick={() => copy("direct")}>{copied === "direct" ? <Check size={15} /> : <Copy size={15} />}</button>
      <button className={btn} title="Duplicate as draft" aria-label={`Duplicate ${name}`} onClick={async () => { const r = await duplicateProduct(id); if (r.id) router.push(`/admin/products/${r.id}`); }}><CopyPlus size={15} /></button>
      <details className="relative">
        <summary className={`${btn} list-none cursor-pointer`} aria-label={`More actions for ${name}`}><MoreHorizontal size={15} /></summary>
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-sm border border-line bg-white p-1 text-sm shadow-lg">
          <button className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-ivory" onClick={async () => { const r = await setForceOutOfStock(id, !forceOut); setMsg(r.message ?? ""); router.refresh(); }}>{forceOut ? "Put back on sale" : "Mark out of stock"}</button>
          {status !== "active" && <button className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-ivory" onClick={async () => { await setProductStatus(id, "active"); router.refresh(); }}>Publish</button>}
          {status === "active" && <button className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-ivory" onClick={async () => { await setProductStatus(id, "draft"); router.refresh(); }}>Unpublish</button>}
          {status !== "archived" && <button className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-ivory" onClick={async () => { await setProductStatus(id, "archived"); router.refresh(); }}>Archive</button>}
          <a className="block rounded-sm px-2 py-1.5 hover:bg-ivory" href={`/p/${slug}`} target="_blank" rel="noreferrer">View on store</a>
        </div>
      </details>
      {msg && <span className="text-xs font-medium text-pine" role="status">{msg}</span>}
    </div>
  );
}
