"use client";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { requestOtp, verifyOtp } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [input, setInput] = useState("");
  const [identifier, setIdentifier] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const channel = identifier?.includes("@") ? "email" : "WhatsApp";
  return (
    <div className="card-pop w-full max-w-md p-6">
      <h1 className="text-3xl">{identifier ? "Enter your code" : "Log in"}</h1>
      {!identifier ? (
        <form className="mt-4 space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError("");
          const r = await requestOtp(input);
          setBusy(false);
          if (r.error) setError(r.error); else { setIdentifier(r.identifier!); setDevCode(r.devCode); }
        }}>
          <p className="text-sm text-ink-soft">See your orders, track parcels and check out faster. No password to remember.</p>
          <div><label className="label" htmlFor="id">Mobile number or email</label><input id="id" className="input" required autoFocus autoComplete="username" value={input} onChange={(e) => setInput(e.target.value)} /></div>
          {error && <p className="text-sm font-medium text-clay" role="alert">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Send login code</button>
        </form>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError("");
          const r = await verifyOtp(identifier, code, next);
          setBusy(false);
          if (r?.error) setError(r.error);
        }}>
          <p className="text-sm text-ink-soft">We sent a 6-digit code to <b>{identifier}</b> on {channel}.</p>
          {devCode && <p className="rounded-sm border border-line bg-sand-soft p-3 text-sm font-medium">Test mode: {channel} isn&apos;t connected yet, so your code is <span className="font-mono">{devCode}</span></p>}
          <div><label className="label" htmlFor="otp">6-digit code</label><input id="otp" className="input text-center font-mono text-2xl tracking-[0.4em]" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
          {error && <p className="text-sm font-medium text-clay" role="alert">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Log in</button>
          <button type="button" className="w-full text-sm font-medium underline" onClick={() => { setIdentifier(null); setCode(""); setError(""); }}>Use a different number or email</button>
        </form>
      )}
      <p className="mt-4 flex items-center justify-center gap-1 text-xs text-ink-soft"><ShieldCheck size={14} aria-hidden /> Never share this code with anyone.</p>
    </div>
  );
}
