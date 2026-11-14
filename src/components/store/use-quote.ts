"use client";
import { useEffect, useRef, useState } from "react";
import type { CartQuote } from "@/lib/cart";
import type { CartItem } from "./cart-context";

export function useQuote(items: CartItem[], opts: { coupon?: string; paymentMethod?: "razorpay" | "cod"; email?: string; phone?: string; enabled?: boolean }) {
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const key = JSON.stringify({ items, c: opts.coupon, p: opts.paymentMethod, e: opts.email, ph: opts.phone });
  useEffect(() => {
    if (opts.enabled === false) return;
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/cart/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, couponCode: opts.coupon, paymentMethod: opts.paymentMethod, email: opts.email, phone: opts.phone }),
        });
        const json = await res.json();
        if (id === seq.current) setQuote(json);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opts.enabled]);
  return { quote, loading };
}
