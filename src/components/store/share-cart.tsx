"use client";
import { useEffect, useState } from "react";
import { Link2, Share2 } from "lucide-react";
import { useCart, type CartItem } from "./cart-context";
import { track } from "./tracker";
import { money } from "@/lib/format";

/** The cart as a link: /cart?items=variant:qty,variant:qty. Anyone who opens it gets the same items. */
export function cartLink(items: CartItem[]) {
  const enc = items.filter((i) => i.qty > 0).map((i) => `${i.variantId}:${i.qty}`).join(",");
  return `${location.origin}/cart?items=${encodeURIComponent(enc)}`;
}
function parse(v: string | null): CartItem[] {
  if (!v) return [];
  return v.split(",").map((p) => p.split(":")).filter(([id, q]) => /^[\w-]{4,40}$/.test(id ?? "") && /^\d{1,3}$/.test(q ?? ""))
    .map(([variantId, q]) => ({ variantId, qty: Math.min(50, Number(q)) })).filter((i) => i.qty > 0).slice(0, 50);
}

/** "Send this cart on WhatsApp": a family member opens the link and pays. */
export function ShareCart({ total }: { total: number | null }) {
  const { items } = useCart();
  const [copied, setCopied] = useState(false);
  if (!items.length) return null;
  const pieces = items.reduce((a, i) => a + i.qty, 0);
  const text = () => `My WonderVastra cart: ${pieces} ${pieces === 1 ? "piece" : "pieces"}${total ? `, ${money(total)} with free delivery` : ""}. Open it and order here: ${cartLink(items)}`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="share-cart">
      <a className="btn btn-white btn-sm" href={`https://wa.me/?text=${encodeURIComponent(text())}`} target="_blank" rel="noopener noreferrer" onClick={() => track("share_cart", "whatsapp")}>
        <Share2 size={15} aria-hidden /> Send cart on WhatsApp
      </a>
      <button type="button" className="btn btn-white btn-sm" onClick={async () => {
        track("share_cart", "link");
        const url = cartLink(items);
        try {
          if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "My WonderVastra cart", text: text().replace(url, "").trim(), url }); return; }
          await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500);
        } catch { /* closed the share sheet */ }
      }}><Link2 size={15} aria-hidden /> {copied ? "Link copied" : "Copy cart link"}</button>
    </div>
  );
}

/** Opening a shared cart link: fill an empty cart straight away, otherwise ask. */
export function SharedCartArrival() {
  const { items, ready, add, replaceAll } = useCart();
  const [shared, setShared] = useState<CartItem[] | null>(null);
  useEffect(() => {
    if (!ready || shared) return;
    const got = parse(new URLSearchParams(location.search).get("items"));
    if (!got.length) return;
    const url = new URL(location.href); url.searchParams.delete("items"); history.replaceState(history.state, "", url);
    if (!items.length) { replaceAll(got); track("shared_cart_open", "filled"); return; }
    // Same items already in the cart (e.g. the sender opening their own link): nothing to ask.
    const same = got.length === items.length && got.every((g) => items.some((i) => i.variantId === g.variantId && i.qty === g.qty));
    if (!same) setShared(got);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  if (!shared) return null;
  const n = shared.reduce((a, i) => a + i.qty, 0);
  return (
    <div role="status" className="rounded-sm border border-ink bg-sand-soft p-3 text-sm" data-testid="shared-cart">
      <p className="font-medium">Someone shared a cart with you ({n} {n === 1 ? "piece" : "pieces"}). Your cart already has items.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { replaceAll(shared); setShared(null); track("shared_cart_open", "replace"); }}>Use the shared cart</button>
        <button type="button" className="btn btn-white btn-sm" onClick={() => { shared.forEach((i) => add(i.variantId, i.qty, { open: false })); setShared(null); track("shared_cart_open", "add"); }}>Add to my cart</button>
        <button type="button" className="btn btn-white btn-sm" onClick={() => setShared(null)}>Keep my cart</button>
      </div>
    </div>
  );
}
