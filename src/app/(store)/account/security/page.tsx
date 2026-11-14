import type { Metadata } from "next";
import { CheckCircle2, Circle } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { googleConfigured } from "@/lib/customer-auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Login & security", robots: { index: false } };

export default async function Security() {
  const c = await requireCustomer("/account/security");
  const methods = [
    { on: Boolean(c.email), label: "Email code", text: c.email ? `A 6-digit code sent to ${c.email}.` : "Add an email by logging in with one." },
    { on: Boolean(c.passwordHash), label: "Password", text: c.passwordHash ? "Log in with your email and password." : "Not set. Add one below if you'd like to log in without a code." },
    ...(googleConfigured() || c.googleSub ? [{ on: Boolean(c.googleSub), label: "Google", text: c.googleSub ? "Linked. “Continue with Google” opens this account." : `Use “Continue with Google” with ${c.email ?? "the same email"} and it links to this account automatically.` }] : []),
  ];
  return (
    <div className="grid max-w-2xl gap-5">
      <section className="card p-4 sm:p-5">
        <h2 className="text-xl">Ways to log in</h2>
        <ul className="mt-3 grid gap-3">
          {methods.map((m) => (
            <li key={m.label} className="flex items-start gap-3">
              {m.on ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-pine" aria-label="On" /> : <Circle size={20} className="mt-0.5 shrink-0 text-ink-soft" aria-label="Off" />}
              <span><b>{m.label}</b><span className="block text-sm text-ink-soft">{m.text}</span></span>
            </li>
          ))}
        </ul>
      </section>
      {c.email && <PasswordForm hasPassword={Boolean(c.passwordHash)} />}
    </div>
  );
}
