"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="flex shrink-0 items-center gap-1.5 rounded-xs border border-dashed border-ink/40 px-2.5 py-1.5 text-sm font-medium tracking-wide"
      aria-label={`Copy coupon code ${code}`}
      onClick={async () => {
        await navigator.clipboard?.writeText(code).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {code} {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
    </button>
  );
}
