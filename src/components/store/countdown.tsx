"use client";
import { useEffect, useState } from "react";

export function Countdown({ endsAt, compact = false, dark = false, big = false }: { endsAt: number; compact?: boolean; dark?: boolean; /** Large red sale-style blocks. */ big?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now == null) return <span className="inline-block h-5 w-24" aria-hidden />;
  const left = Math.max(0, endsAt - now);
  if (!left) return <span className="font-bold">Ended</span>;
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor(left / 3_600_000) % 24;
  const m = Math.floor(left / 60_000) % 60;
  const s = Math.floor(left / 1000) % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const label = `${d ? `${d} days ` : ""}${h} hours ${m} minutes left`;
  if (compact) return <span className="font-bold tabular-nums" aria-label={label}>{d > 0 && `${d}d `}{pad(h)}:{pad(m)}:{pad(s)}</span>;
  const parts = [...(d > 0 ? [["days", d]] : []), ["hrs", h], ["min", m], ["sec", s]] as [string, number][];
  if (big) return (
    <div className="flex gap-2" role="timer" aria-label={label}>
      {parts.map(([k, v]) => (
        <div key={k} className="w-[4.2rem] bg-[#E3202A] py-2 text-center text-white shadow-[4px_4px_0_#4A1420] sm:w-20">
          <div className={`font-display text-4xl leading-none tabular-nums sm:text-5xl ${k === "sec" ? "wv-tick" : ""}`} key={k === "sec" ? v : undefined}>{pad(v)}</div>
          <div className="mt-1 text-[11px] font-extrabold tracking-[0.14em] uppercase">{k}</div>
        </div>
      ))}
    </div>
  );
  return (
    <div className="flex gap-1.5" role="timer" aria-label={label}>
      {parts.map(([k, v]) => (
        <div key={k} className={`w-14 py-1.5 text-center ${dark ? "bg-white text-ink" : "bg-ink text-white"}`}>
          <div className="font-display text-2xl leading-none tabular-nums">{pad(v)}</div>
          <div className="mt-0.5 text-[11px] font-bold tracking-[0.1em] uppercase opacity-70">{k}</div>
        </div>
      ))}
    </div>
  );
}
