"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setAccountPassword } from "../../login/actions";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-xl">{hasPassword ? "Change password" : "Add a password"}</h2>
      <form className="mt-3 grid gap-3 sm:max-w-sm" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        const r = await setAccountPassword(current, next);
        setBusy(false);
        setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: hasPassword ? "Password changed." : "Password added. You can now log in with your email and password." });
        if (!r.error) { setCurrent(""); setNext(""); router.refresh(); }
      }}>
        {hasPassword && <div><label className="label" htmlFor="cur">Current password</label><input id="cur" className="input" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>}
        <div><label className="label" htmlFor="newpw">{hasPassword ? "New password" : "Password"}</label><input id="newpw" className="input" type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /><p className="mt-1 text-xs text-ink-soft">At least 8 characters.</p></div>
        {msg && <p className={`text-sm font-medium ${msg.ok ? "text-pine" : "text-clay"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
        <button className="btn btn-primary w-fit" disabled={busy}>{hasPassword ? "Change password" : "Add password"}</button>
      </form>
    </section>
  );
}
