"use client";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand-logo";
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { adminLogin } from "../actions";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-sand p-4">
      <form className="card-pop w-full max-w-sm space-y-4 p-6" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError("");
        const r = await adminLogin(email, password);
        if (r.error) { setError(r.error); setBusy(false); } else { router.replace("/admin"); router.refresh(); }
      }}>
        <p aria-label="WonderVastra"><Logo /></p>
        <h1 className="flex items-center gap-2 text-lg"><Lock size={16} aria-hidden /> Seller login</h1>
        <div><label className="label" htmlFor="e">Email</label><input id="e" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="p">Password</label><input id="p" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <p className="text-sm font-medium text-clay" role="alert">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Log in</button>
      </form>
    </div>
  );
}
