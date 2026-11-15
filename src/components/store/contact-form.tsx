"use client";
import { useState } from "react";
import { Check, Send } from "lucide-react";
import { sendContactMessage } from "@/app/(store)/contact-actions";

/** Contact us: the message goes to the store's support inbox, and we reply by email. */
export function ContactForm() {
  const [f, setF] = useState({ name: "", email: "", phone: "", order: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  if (done) return <p className="flex items-start gap-2 rounded-sm bg-pine-soft p-4 text-sm not-prose" role="status" data-testid="contact-sent"><Check size={18} aria-hidden className="mt-0.5 shrink-0" /><span><b>Thanks, your message is with us.</b> We reply by email within one working day.</span></p>;
  return (
    <form className="not-prose space-y-3" data-testid="contact-form" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr("");
      const r = await sendContactMessage(f);
      setBusy(false);
      if (r.error) setErr(r.error); else setDone(true);
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="c-name">Your name</label><input id="c-name" className="input" autoComplete="name" value={f.name} onChange={set("name")} /></div>
        <div><label className="label" htmlFor="c-email">Email</label><input id="c-email" className="input" type="email" autoComplete="email" value={f.email} onChange={set("email")} /></div>
        <div><label className="label" htmlFor="c-phone">Mobile <span className="font-normal text-ink-soft">(optional)</span></label><input id="c-phone" className="input" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} /></div>
        <div><label className="label" htmlFor="c-order">Order number <span className="font-normal text-ink-soft">(if it&apos;s about an order)</span></label><input id="c-order" className="input" placeholder="e.g. WV53VY875" value={f.order} onChange={set("order")} /></div>
      </div>
      <div><label className="label" htmlFor="c-msg">How can we help?</label><textarea id="c-msg" className="input" rows={5} maxLength={2000} value={f.message} onChange={set("message")} /></div>
      <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={set("website")} name="website" />
      {err && <p className="rounded-sm bg-clay-soft p-2.5 text-sm font-medium" role="alert">{err}</p>}
      <button disabled={busy} className="btn btn-primary"><Send size={16} aria-hidden /> {busy ? "Sending…" : "Send message"}</button>
    </form>
  );
}
