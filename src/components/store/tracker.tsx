"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * First-party analytics: page views with time on page and scroll depth, clicks, and shopping steps.
 * An anonymous visit id lives in this browser only (renewed after 30 minutes away). No personal data.
 */
const SID = "wv_sid", SEEN = "wv_sid_at";
const rid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
function session() {
  try {
    const now = Date.now();
    let s = localStorage.getItem(SID);
    if (!s || now - Number(localStorage.getItem(SEEN) ?? 0) > 30 * 60_000) { s = rid(); localStorage.setItem(SID, s); }
    localStorage.setItem(SEEN, String(now));
    return s;
  } catch { return "anon-" + rid(); }
}
function send(body: Record<string, unknown>) {
  const data = JSON.stringify({ s: session(), ...body });
  try {
    if (navigator.sendBeacon?.("/api/t", new Blob([data], { type: "text/plain" }))) return;
  } catch { /* fall back */ }
  fetch("/api/t", { method: "POST", body: data, keepalive: true }).catch(() => {});
}
/** Shopping steps from anywhere in the store: add_to_cart, search, size_guide, checkout_start, purchase … */
export function track(type: string, label?: string | null, productId?: string | null) {
  if (typeof window === "undefined") return;
  send({ k: "ev", type, label: label ?? null, pid: productId ?? null, path: location.pathname });
}

let last: { path: string; id: string; at: number } | null = null;

export function Tracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    const path = pathname + (search.get("q") ? `?q=${search.get("q")}` : "");
    // One view per page visit, even if the effect re-runs straight away (fast refresh, strict mode).
    const reuse = last && last.path === path && Date.now() - last.at < 2000;
    const id = reuse ? last!.id : rid();
    last = { path, id, at: Date.now() };
    const pid = document.querySelector<HTMLElement>("[data-product-id]")?.dataset.productId ?? null;
    const utm = search.get("utm_source");
    if (!reuse) send({ k: "pv", id, path, pid, ref: document.referrer || null, utm });
    let visible = document.visibilityState === "visible" ? Date.now() : 0;
    let spent = 0, scroll = 0, ended = false;
    const onScroll = () => {
      const h = document.documentElement;
      const pct = Math.round(((h.scrollTop + innerHeight) / Math.max(1, h.scrollHeight)) * 100);
      if (pct > scroll) scroll = Math.min(100, pct);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") { if (visible) spent += Date.now() - visible; visible = 0; end(false); }
      else visible = Date.now();
    };
    const end = (final: boolean) => {
      if (ended) return;
      const dur = spent + (visible ? Date.now() - visible : 0);
      send({ k: "end", id, dur, scroll, path, pid });
      if (final) ended = true;
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("a,button,summary,[data-track]");
      if (!el || el.closest("[data-no-track]")) return;
      const label = (el.dataset.track || el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (label) send({ k: "ev", type: "click", label, path: location.pathname, pid });
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("click", onClick, true);
    addEventListener("pagehide", () => end(true));
    return () => {
      removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("click", onClick, true);
      end(true);
    };
  }, [pathname, search]);
  return null;
}
