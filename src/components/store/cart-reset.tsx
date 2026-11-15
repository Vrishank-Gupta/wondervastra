"use client";
import { useEffect } from "react";
import { useCart } from "./cart-context";
import { track } from "./tracker";

export function CartResetOnPlaced({ orderNumber }: { orderNumber?: string }) {
  const { clear, ready } = useCart();
  useEffect(() => {
    if (!ready) return;
    clear();
    // Counted once per order on this browser.
    try { if (orderNumber && !sessionStorage.getItem(`wv_bought_${orderNumber}`)) { sessionStorage.setItem(`wv_bought_${orderNumber}`, "1"); track("purchase", orderNumber); } } catch { /* private mode */ }
  }, [ready, clear, orderNumber]);
  return null;
}
