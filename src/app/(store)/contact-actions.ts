"use server";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/auth";
import { dispatch, renderEmail } from "@/lib/notifications";
import { escapeHtml } from "@/lib/utils";
import { getSettings } from "@/lib/settings";

/** Contact form: emails the store's support inbox; replying answers the customer directly. */
export async function sendContactMessage(input: { name: string; email: string; phone: string; order: string; message: string; website?: string }): Promise<{ error?: string; ok?: boolean }> {
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const f = { name: str(input?.name, 80), email: str(input?.email, 120).toLowerCase(), phone: str(input?.phone, 20), order: str(input?.order, 30), message: str(input?.message, 2000) };
  if (str(input?.website, 100)) return { ok: true }; // a bot filled the hidden field
  if (f.name.length < 2) return { error: "Please tell us your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) return { error: "Enter an email address we can reply to." };
  if (f.phone && f.phone.replace(/\D/g, "").length < 10) return { error: "Enter a 10-digit mobile number, or leave it empty." };
  if (f.message.length < 10) return { error: "Please write a little more so we can help." };
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`contact:${ip}`, 5, 60 * 60_000)) || !(await rateLimit(`contact:${f.email}`, 5, 60 * 60_000))) return { error: "You've sent a few messages already. We'll reply soon, or try again in an hour." };
  const s = await getSettings();
  const to = s.supportEmail || s.adminAlertEmail;
  if (!to) return { error: "Messages aren't set up yet. Please try again later." };
  await dispatch({
    event: "contact_message",
    email: {
      to, replyTo: f.email,
      subject: `Message from ${f.name}${f.order ? ` about ${f.order}` : ""}`,
      html: renderEmail({
        heading: "New message from the website",
        lines: [
          `<b>${escapeHtml(f.name)}</b> · ${escapeHtml(f.email)}${f.phone ? ` · ${escapeHtml(f.phone)}` : ""}${f.order ? `<br>Order: <b>${escapeHtml(f.order)}</b>` : ""}`,
          `<div style="white-space:pre-wrap;border-left:3px solid #ddd;padding-left:10px">${escapeHtml(f.message)}</div>`,
          "Reply to this email to answer the customer.",
        ],
      }, "Contact form"),
    },
  });
  return { ok: true };
}
