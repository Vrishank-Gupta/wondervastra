"use client";
import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { completeEmailCode, passwordLogin, requestOtp, sendEmailCode, verifyOtp } from "./actions";

/** Google's own "G" mark, as its sign-in branding guidelines ask. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton({ next, label = "Continue with Google" }: { next: string; label?: string }) {
  return (
    <a href={`/api/auth/google?next=${encodeURIComponent(next)}`} className="flex min-h-12 w-full items-center justify-center gap-3 border border-[#cfcfcf] bg-white px-4 text-[15px] font-semibold text-ink hover:border-ink">
      <GoogleG /> {label}
    </a>
  );
}
const Or = () => <p className="my-4 flex items-center gap-3 text-xs font-semibold tracking-[0.12em] text-ink-soft uppercase"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></p>;
const Err = ({ text }: { text: string }) => (text ? <p className="text-sm font-medium text-clay" role="alert">{text}</p> : null);
const Spin = ({ on }: { on: boolean }) => (on ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null);
const DevCode = ({ code, channel }: { code?: string; channel: string }) => (code ? <p className="rounded-sm border border-line bg-sand-soft p-3 text-sm font-medium">Test mode: {channel} isn&apos;t connected yet, so your code is <span className="font-mono">{code}</span></p> : null);

function PasswordInput({ id, label, value, onChange, autoComplete, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input id={id} className="input pr-12" type={show ? "text" : "password"} required autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-soft hover:text-ink" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </div>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}
function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div><label className="label" htmlFor="otp">6-digit code</label><input id="otp" className="input text-center font-mono text-2xl tracking-[0.4em]" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} /></div>;
}

type Mode = "code" | "password" | "forgot";

export function LoginForm({ next, google, initialError = "" }: { next: string; google: boolean; initialError?: string }) {
  const [mode, setMode] = useState<Mode>("code");
  const [input, setInput] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const go = (m: Mode) => { setMode(m); setSentTo(null); setCode(""); setError(""); setPassword(""); };
  const run = async (fn: () => Promise<{ error?: string } | void>) => { setBusy(true); setError(""); const r = await fn(); setBusy(false); if (r?.error) setError(r.error); };
  const channel = sentTo?.includes("@") ? "email" : "WhatsApp";

  const title = sentTo ? (mode === "forgot" ? "Set a new password" : "Enter your code") : mode === "forgot" ? "Forgot password" : "Log in";
  return (
    <div className="card-pop w-full max-w-md p-6">
      <h1 className="text-3xl">{title}</h1>
      {!sentTo && mode !== "forgot" && google && <div className="mt-4"><GoogleButton next={next} /><Or /></div>}

      {mode === "code" && !sentTo && (
        <form className={`${google ? "" : "mt-4"} space-y-4`} onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await requestOtp(input); if (!r.error) { setSentTo(r.identifier!); setDevCode(r.devCode); } return r; }); }}>
          <p className="text-sm text-ink-soft">We&apos;ll send you a 6-digit code. New here? The same code creates your account.</p>
          <div><label className="label" htmlFor="id">Email or mobile number</label><input id="id" className="input" required autoComplete="username" value={input} onChange={(e) => setInput(e.target.value)} /></div>
          <Err text={error} />
          <button className="btn btn-primary w-full" disabled={busy}><Spin on={busy} />Send login code</button>
          <button type="button" className="w-full text-sm font-medium underline" onClick={() => go("password")}>Log in with a password instead</button>
        </form>
      )}
      {mode === "code" && sentTo && (
        <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => verifyOtp(sentTo, code, next)); }}>
          <p className="text-sm text-ink-soft">We sent a 6-digit code to <b>{sentTo}</b> on {channel}.</p>
          <DevCode code={devCode} channel={channel} />
          <CodeInput value={code} onChange={setCode} />
          <Err text={error} />
          <button className="btn btn-primary w-full" disabled={busy}><Spin on={busy} />Log in</button>
          <button type="button" className="w-full text-sm font-medium underline" onClick={() => go("code")}>Use a different number or email</button>
        </form>
      )}

      {mode === "password" && (
        <form className={`${google ? "" : "mt-4"} space-y-4`} onSubmit={(e) => { e.preventDefault(); void run(() => passwordLogin(input, password, next)); }}>
          <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" required autoComplete="email" value={input} onChange={(e) => setInput(e.target.value)} /></div>
          <PasswordInput id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <Err text={error} />
          <button className="btn btn-primary w-full" disabled={busy}><Spin on={busy} />Log in</button>
          <div className="flex flex-wrap justify-between gap-2 text-sm font-medium">
            <button type="button" className="underline" onClick={() => go("forgot")}>Forgot password?</button>
            <button type="button" className="underline" onClick={() => go("code")}>Log in with a code instead</button>
          </div>
        </form>
      )}

      {mode === "forgot" && !sentTo && (
        <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await sendEmailCode(input, "reset"); if (!r.error) { setSentTo(r.email!); setDevCode(r.devCode); } return r; }); }}>
          <p className="text-sm text-ink-soft">We&apos;ll email you a code. Enter it with your new password and you&apos;re logged in.</p>
          <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" required autoComplete="email" value={input} onChange={(e) => setInput(e.target.value)} /></div>
          <Err text={error} />
          <button className="btn btn-primary w-full" disabled={busy}><Spin on={busy} />Email me a code</button>
          <button type="button" className="w-full text-sm font-medium underline" onClick={() => go("password")}>Back to log in</button>
        </form>
      )}
      {mode === "forgot" && sentTo && (
        <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => completeEmailCode({ email: sentTo, code, password, next })); }}>
          <p className="text-sm text-ink-soft">We sent a 6-digit code to <b>{sentTo}</b>.</p>
          <DevCode code={devCode} channel="email" />
          <CodeInput value={code} onChange={setCode} />
          <PasswordInput id="newpw" label="New password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters." />
          <Err text={error} />
          <button className="btn btn-primary w-full" disabled={busy}><Spin on={busy} />Save password and log in</button>
        </form>
      )}

      <p className="mt-5 border-t border-line pt-4 text-center text-sm">New to WonderVastra? <Link className="font-semibold underline" href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
      <p className="mt-3 flex items-center justify-center gap-1 text-xs text-ink-soft"><ShieldCheck size={14} aria-hidden /> Never share a login code with anyone.</p>
    </div>
  );
}

export function SignupForm({ next, google }: { next: string; google: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ error?: string } | void>) => { setBusy(true); setError(""); const r = await fn(); setBusy(false); if (r?.error) setError(r.error); };
  return (
    <div className="card-pop w-full max-w-md p-6">
      <h1 className="text-3xl">{sentTo ? "Check your email" : "Create an account"}</h1>
      {!sentTo ? (
        <>
          {google && <div className="mt-4"><GoogleButton next={next} label="Sign up with Google" /><Or /></div>}
          <form className={`${google ? "" : "mt-4"} space-y-4`} onSubmit={(e) => {
            e.preventDefault();
            if (password.length < 8) { setError("Use at least 8 characters for your password."); return; }
            void run(async () => { const r = await sendEmailCode(email, "signup"); if (!r.error) { setSentTo(r.email!); setDevCode(r.devCode); } return r; });
          }}>
            <div><label className="label" htmlFor="name">Your name</label><input id="name" className="input" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <PasswordInput id="password" label="Choose a password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters." />
            <Err text={error} />
            <button className="btn btn-primary w-full" disabled={busy}><Spin on={busy} />Create account</button>
          </form>
        </>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => completeEmailCode({ email: sentTo, code, password, name, next })); }}>
          <p className="text-sm text-ink-soft">We sent a 6-digit code to <b>{sentTo}</b>. Enter it to confirm your email and finish creating your account.</p>
          <DevCode code={devCode} channel="email" />
          <CodeInput value={code} onChange={setCode} />
          <Err text={error} />
          <button className="btn btn-primary w-full" disabled={busy}><Spin on={busy} />Confirm and create account</button>
          <button type="button" className="w-full text-sm font-medium underline" onClick={() => { setSentTo(null); setCode(""); setError(""); }}>Change email</button>
        </form>
      )}
      <p className="mt-5 border-t border-line pt-4 text-center text-sm">Already have an account? <Link className="font-semibold underline" href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link></p>
    </div>
  );
}
