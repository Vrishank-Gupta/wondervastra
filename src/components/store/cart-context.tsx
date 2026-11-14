"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = { variantId: string; qty: number };
type Attribution = { utmSource?: string; utmCampaign?: string };
type CartCtx = {
  items: CartItem[];
  count: number;
  ready: boolean;
  add: (variantId: string, qty?: number, opts?: { open?: boolean }) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  replaceAll: (items: CartItem[]) => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  coupon: string;
  setCoupon: (c: string) => void;
  attribution: Attribution;
};
const Ctx = createContext<CartCtx | null>(null);

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [coupon, setCouponState] = useState("");
  const [attribution, setAttribution] = useState<Attribution>({});
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setItems(read<CartItem[]>("vv_cart", []));
    let c = read<string>("vv_coupon", "");
    let a = read<Attribution>("vv_attr", {});
    // Instagram/WhatsApp links carry ?utm_source=instagram and optionally ?coupon=CODE.
    const p = new URLSearchParams(window.location.search);
    const couponParam = p.get("coupon");
    if (couponParam) { c = couponParam.toUpperCase(); write("vv_coupon", c); }
    const source = p.get("utm_source");
    if (source) {
      a = { utmSource: source.slice(0, 40), utmCampaign: p.get("utm_campaign")?.slice(0, 60) ?? undefined };
      write("vv_attr", a);
    } else if (!a.utmSource && document.referrer) {
      const r = document.referrer;
      if (/instagram\.com/.test(r)) a = { utmSource: "instagram" };
      else if (/whatsapp\.com|wa\.me/.test(r)) a = { utmSource: "whatsapp" };
      else if (/facebook\.com/.test(r)) a = { utmSource: "facebook" };
      else if (/google\./.test(r)) a = { utmSource: "google" };
      write("vv_attr", a);
    }
    setCouponState(c);
    setAttribution(a);
    setReady(true);
  }, []);
  useEffect(() => { if (ready) write("vv_cart", items); }, [items, ready]);

  const add = useCallback<CartCtx["add"]>((variantId, qty = 1, opts) => {
    setItems((cur) => {
      const found = cur.find((i) => i.variantId === variantId);
      return found ? cur.map((i) => (i.variantId === variantId ? { ...i, qty: i.qty + qty } : i)) : [...cur, { variantId, qty }];
    });
    if (opts?.open !== false) setDrawerOpen(true);
  }, []);
  const setQty = useCallback((variantId: string, qty: number) => {
    setItems((cur) => (qty <= 0 ? cur.filter((i) => i.variantId !== variantId) : cur.map((i) => (i.variantId === variantId ? { ...i, qty } : i))));
  }, []);
  const remove = useCallback((variantId: string) => setItems((cur) => cur.filter((i) => i.variantId !== variantId)), []);
  const clear = useCallback(() => setItems([]), []);
  const replaceAll = useCallback((next: CartItem[]) => setItems(next), []);
  const setCoupon = useCallback((c: string) => { setCouponState(c); write("vv_coupon", c); }, []);

  const value = useMemo(
    () => ({ items, count: items.reduce((a, i) => a + i.qty, 0), ready, add, setQty, remove, clear, replaceAll, drawerOpen, setDrawerOpen, coupon, setCoupon, attribution }),
    [items, ready, add, setQty, remove, clear, replaceAll, drawerOpen, coupon, setCoupon, attribution],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside provider");
  return c;
}
