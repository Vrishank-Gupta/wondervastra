"use client";
import { useEffect, useRef } from "react";

/**
 * A light snowfall over the home banner. One canvas, a few dozen soft flakes drawn at ~30fps.
 * Pauses off-screen and in background tabs; off for reduced motion, data saver and very low-end phones.
 */
export function Snowfall({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || nav.connection?.saveData || (nav.deviceMemory ?? 4) < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    let w = 0, h = 0, raf = 0, last = 0, visible = true;
    type Flake = { x: number; y: number; r: number; vy: number; drift: number; phase: number; a: number };
    let flakes: Flake[] = [];
    const make = (top: boolean): Flake => ({
      x: Math.random() * w, y: top ? -10 : Math.random() * h, r: 0.8 + Math.random() * 2.4,
      vy: 0.25 + Math.random() * 0.6, drift: 0.3 + Math.random() * 0.7, phase: Math.random() * Math.PI * 2, a: 0.45 + Math.random() * 0.45,
    });
    const size = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w < 640 ? 26 : 46) * density);
      flakes = Array.from({ length: n }, () => make(false));
    };
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || t - last < 33) return;
      const step = Math.min(3, (t - last) / 16.7);
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += f.vy * step;
        f.phase += 0.012 * step;
        f.x += Math.sin(f.phase) * f.drift * 0.35 * step;
        if (f.y > h + 6) Object.assign(f, make(true));
        if (f.x > w + 6) f.x = -6; else if (f.x < -6) f.x = w + 6;
        ctx.globalAlpha = f.a;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
      }
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting && document.visibilityState === "visible"; });
    io.observe(canvas);
    const onVis = () => { visible = document.visibilityState === "visible"; };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, [density]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-[1] size-full" />;
}
