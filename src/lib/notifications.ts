import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { money, STATUS_LABEL } from "./format";
import { getSettings } from "./settings";
import { escapeHtml, newId, siteUrl } from "./utils";

export type OrderEventName =
  | "order_placed" | "order_packed" | "order_shipped" | "out_for_delivery" | "order_delivered"
  | "order_cancelled" | "order_refunded" | "tracking_updated" | "return_update";

type Order = typeof schema.orders.$inferSelect;

export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY); }
export function whatsappConfigured() { return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID); }

export const trackingLink = (o: Pick<Order, "accessToken">) => `${siteUrl()}/order/${o.accessToken}`;
export const feedbackLink = (o: Pick<Order, "accessToken">, type: "order" | "delivery") => `${siteUrl()}/feedback/${o.accessToken}?type=${type}`;

/** Where the buyer tracks the parcel: courier link if we have it, otherwise our order page. */
const parcelLink = (o: Order) => o.trackingUrl || trackingLink(o);

type Message = {
  subject: string;
  heading: string;
  lines: string[];
  cta?: { label: string; url: string };
  secondary?: { label: string; url: string };
  /** Pre-approved WhatsApp template name and its {{n}} values, in order. */
  template: string;
  params: string[];
  /** Plain text used for one-tap manual WhatsApp sending. */
  text: string;
};

export function buildOrderMessage(event: OrderEventName, o: Order, opts: { orderFeedback: boolean; deliveryFeedback: boolean }): Message {
  const first = o.name.split(" ")[0];
  const track = trackingLink(o);
  const shipLine = [o.courier, o.awb ? `AWB ${o.awb}` : null].filter(Boolean).join(" · ");
  switch (event) {
    case "order_placed": {
      const fb = feedbackLink(o, "order");
      return {
        subject: `Order ${o.number} confirmed`,
        heading: `Thanks ${first}, your order is confirmed`,
        lines: [
          `Order <b>${escapeHtml(o.number)}</b> for <b>${money(o.total)}</b> is confirmed (${o.paymentMethod === "cod" ? "cash on delivery" : "paid online"}).`,
          "We'll message you as soon as it ships.",
          ...(opts.orderFeedback ? [`How was ordering from us? <a href="${fb}">Tell us in 10 seconds</a>.`] : []),
        ],
        cta: { label: "Track your order", url: track },
        template: "vv_order_placed",
        params: [first, o.number, money(o.total), track, fb],
        text: `Hi ${first}, your WonderVastra order ${o.number} for ${money(o.total)} is confirmed\nTrack it: ${track}${opts.orderFeedback ? `\nHow was ordering from us? ${fb}` : ""}`,
      };
    }
    case "order_packed":
      return {
        subject: `Order ${o.number} is packed`,
        heading: "All packed and ready to go",
        lines: [`Order <b>${escapeHtml(o.number)}</b> is packed and will be handed to the courier soon.`],
        cta: { label: "View order", url: track },
        template: "vv_order_packed",
        params: [first, o.number, track],
        text: `Hi ${first}, your WonderVastra order ${o.number} is packed\nDetails: ${track}`,
      };
    case "order_shipped":
    case "tracking_updated": {
      const link = parcelLink(o);
      const updated = event === "tracking_updated";
      return {
        subject: updated ? `New tracking details for ${o.number}` : `Order ${o.number} has shipped`,
        heading: updated ? "Your tracking details changed" : "Your order is on its way",
        lines: [
          `Order <b>${escapeHtml(o.number)}</b> ${updated ? "has updated tracking details" : "has shipped"}.`,
          ...(shipLine ? [`<b>${escapeHtml(shipLine)}</b>`] : []),
        ],
        cta: { label: "Track your parcel", url: link },
        template: "vv_order_shipped",
        params: [first, o.number, o.courier || "our courier partner", o.awb || "-", link],
        text: `Hi ${first}, your WonderVastra order ${o.number} ${updated ? "has new tracking details" : "has shipped"}${shipLine ? `\n${shipLine}` : ""}\nTrack it: ${link}`,
      };
    }
    case "out_for_delivery":
      return {
        subject: `Order ${o.number} is out for delivery`,
        heading: "Out for delivery",
        lines: [`Order <b>${escapeHtml(o.number)}</b> is out for delivery. Please keep your phone handy.`, ...(o.paymentMethod === "cod" ? [`Please keep <b>${money(o.total)}</b> ready for cash on delivery.`] : [])],
        cta: { label: "Track your parcel", url: parcelLink(o) },
        template: "vv_out_for_delivery",
        params: [first, o.number, parcelLink(o)],
        text: `Hi ${first}, your WonderVastra order ${o.number} is out for delivery${o.paymentMethod === "cod" ? `\nPlease keep ${money(o.total)} ready.` : ""}\nTrack it: ${parcelLink(o)}`,
      };
    case "order_delivered": {
      const fb = feedbackLink(o, "delivery");
      return {
        subject: `Delivered. How did we do?`,
        heading: "Your order has been delivered",
        lines: [`Order <b>${escapeHtml(o.number)}</b> was delivered. We hope you enjoy it.`, ...(opts.deliveryFeedback ? ["Got a moment? Rate your items and your delivery."] : [])],
        cta: opts.deliveryFeedback ? { label: "Share your feedback", url: fb } : { label: "View order", url: track },
        template: "vv_order_delivered",
        params: [first, o.number, fb],
        text: `Hi ${first}, your WonderVastra order ${o.number} has been delivered${opts.deliveryFeedback ? `\nHow did we do? ${fb}` : ""}`,
      };
    }
    case "order_cancelled":
      return {
        subject: `Order ${o.number} was cancelled`,
        heading: "Your order was cancelled",
        lines: [`Order <b>${escapeHtml(o.number)}</b> has been cancelled.`, ...(o.paymentStatus === "paid" ? ["Your refund will be processed to your original payment method."] : [])],
        cta: { label: "View order", url: track },
        template: "vv_order_cancelled",
        params: [first, o.number, track],
        text: `Hi ${first}, your WonderVastra order ${o.number} has been cancelled.${o.paymentStatus === "paid" ? " Your refund will be processed to your original payment method." : ""}\nDetails: ${track}`,
      };
    case "order_refunded":
      return {
        subject: `Refund processed for ${o.number}`,
        heading: "Your refund is on its way",
        lines: [`We've refunded <b>${money(o.refundedTotal)}</b> for order <b>${escapeHtml(o.number)}</b>. Banks usually take 5–7 working days to show it.`],
        cta: { label: "View order", url: track },
        template: "vv_order_refunded",
        params: [first, money(o.refundedTotal), o.number, track],
        text: `Hi ${first}, we've refunded ${money(o.refundedTotal)} for your WonderVastra order ${o.number}. Banks usually take 5–7 working days to show it.\nDetails: ${track}`,
      };
    case "return_update":
      return {
        subject: `Update on your return for ${o.number}`,
        heading: "Return update",
        lines: [`Your order <b>${escapeHtml(o.number)}</b> is now: <b>${escapeHtml(STATUS_LABEL[o.status] ?? o.status)}</b>.`],
        cta: { label: "View order", url: track },
        template: "vv_return_update",
        params: [first, o.number, STATUS_LABEL[o.status] ?? o.status, track],
        text: `Hi ${first}, update on your WonderVastra order ${o.number}: ${STATUS_LABEL[o.status] ?? o.status}.\nDetails: ${track}`,
      };
  }
}

export function renderEmail(m: Pick<Message, "heading" | "lines" | "cta" | "secondary">, footer: string) {
  const button = (c: { label: string; url: string }) =>
    `<a href="${escapeHtml(c.url)}" style="display:inline-block;background:#1F1C18;color:#F8F5EF;font-weight:500;text-decoration:none;padding:14px 26px;border-radius:2px">${escapeHtml(c.label)}</a>`;
  return `<!doctype html><html><body style="margin:0;background:#F8F5EF;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1F1C18">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFDF9;border:1px solid #E2DBCF;border-radius:2px;overflow:hidden">
<tr><td style="padding:20px 24px 0;font-family:Georgia,serif;font-size:24px;font-weight:400">WonderVastra</td></tr>
<tr><td style="padding:28px 24px">
<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:22px;font-weight:400">${escapeHtml(m.heading)}</h1>
${m.lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${l}</p>`).join("")}
${m.cta ? `<p style="margin:22px 0 4px">${button(m.cta)}</p>` : ""}
</td></tr></table>
<p style="max-width:520px;font-size:12px;color:#655E54;margin:14px 0 0">${escapeHtml(footer)}</p>
</td></tr></table></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "WonderVastra <onboarding@resend.dev>", to, subject, html }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || `Email error ${res.status}`);
  return json?.id as string | undefined;
}
async function sendWhatsApp(phone: string, template: string, params: string[]) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: `91${phone}`,
      type: "template",
      template: {
        name: template,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
        components: params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [],
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `WhatsApp error ${res.status}`);
  return json?.messages?.[0]?.id as string | undefined;
}

type Dispatch = {
  orderId?: string | null;
  event: string;
  email?: { to: string; subject: string; html: string } | null;
  whatsapp?: { to: string; template: string; params: string[]; text: string } | null;
};

/** Never throws: a failed notification must not break an order. Everything is logged for retry. */
export async function dispatch(d: Dispatch) {
  const secret = d.event === "login_otp";
  if (d.email) {
    let status: "sent" | "failed" | "not_configured" = "not_configured";
    let providerId: string | undefined;
    let error: string | undefined;
    if (emailConfigured()) {
      try { providerId = await sendEmail(d.email.to, d.email.subject, d.email.html); status = "sent"; }
      catch (e) { status = "failed"; error = (e as Error).message; }
    }
    await db.insert(schema.notifications).values({
      id: newId(), orderId: d.orderId ?? null, event: d.event, channel: "email", recipient: d.email.to,
      // Login codes are never written to the log.
      subject: secret ? "Login code" : d.email.subject, body: secret ? null : d.email.html, status, providerId, error,
    });
  }
  if (d.whatsapp) {
    let status: "sent" | "failed" | "not_configured" = "not_configured";
    let providerId: string | undefined;
    let error: string | undefined;
    if (whatsappConfigured()) {
      try { providerId = await sendWhatsApp(d.whatsapp.to, d.whatsapp.template, d.whatsapp.params); status = "sent"; }
      catch (e) { status = "failed"; error = (e as Error).message; }
    }
    await db.insert(schema.notifications).values({
      id: newId(), orderId: d.orderId ?? null, event: d.event, channel: "whatsapp", recipient: d.whatsapp.to,
      subject: d.whatsapp.template, body: secret ? null : d.whatsapp.text, template: d.whatsapp.template, params: secret ? [] : d.whatsapp.params, status, providerId, error,
    });
  }
}

export async function notifyOrder(orderId: string, event: OrderEventName) {
  try {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (!o) return;
    const s = await getSettings();
    const m = buildOrderMessage(event, o, { orderFeedback: s.orderFeedbackEnabled, deliveryFeedback: s.deliveryFeedbackEnabled });
    await dispatch({
      orderId,
      event,
      email: { to: o.email, subject: m.subject, html: renderEmail(m, `You're receiving this because you ordered from ${s.storeName}.`) },
      whatsapp: o.whatsappOptIn ? { to: o.phone, template: m.template, params: m.params, text: m.text } : null,
    });
    if (event === "order_placed" && s.adminAlertEmail) {
      await dispatch({
        orderId,
        event: "admin_new_order",
        email: {
          to: s.adminAlertEmail,
          subject: `New order ${o.number} · ${money(o.total)}`,
          html: renderEmail({
            heading: "You have a new order",
            lines: [`<b>${escapeHtml(o.name)}</b> ordered <b>${money(o.total)}</b> (${o.paymentMethod === "cod" ? "COD" : "prepaid"}).`],
            cta: { label: "Open order", url: `${siteUrl()}/admin/orders/${o.id}` },
          }, "Store alert"),
        },
      });
    }
  } catch (e) {
    console.error("notifyOrder failed", event, orderId, e);
  }
}

export async function retryNotification(id: string) {
  const [n] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
  if (!n) throw new Error("Notification not found");
  let status: "sent" | "failed" | "not_configured" = "not_configured";
  let error: string | null = null;
  let providerId = n.providerId;
  try {
    if (n.channel === "email" && emailConfigured()) { providerId = (await sendEmail(n.recipient, n.subject ?? "", n.body ?? "")) ?? null; status = "sent"; }
    if (n.channel === "whatsapp" && whatsappConfigured()) { providerId = (await sendWhatsApp(n.recipient, n.template ?? "", n.params ?? [])) ?? null; status = "sent"; }
  } catch (e) { status = "failed"; error = (e as Error).message; }
  await db.update(schema.notifications).set({ status, error, providerId, attempts: n.attempts + 1, updatedAt: Date.now() }).where(eq(schema.notifications.id, id));
  return status;
}

export async function sendOtpMessage(identifier: string, code: string) {
  const isEmail = identifier.includes("@");
  const html = renderEmail({ heading: `Your login code: ${code}`, lines: ["Enter this code on WonderVastra to log in. It expires in 10 minutes.", "If you didn't ask for it, you can ignore this message."] }, "Never share this code with anyone.");
  await dispatch(isEmail
    ? { event: "login_otp", email: { to: identifier, subject: `${code} is your WonderVastra login code`, html: html } }
    : { event: "login_otp", whatsapp: { to: identifier, template: "vv_login_otp", params: [code], text: `Your WonderVastra login code is ${code}` } });
}

export async function sendBackInStock(a: { email: string | null; phone: string | null }, productName: string, slug: string, launch = false) {
  const url = `${siteUrl()}/p/${slug}?utm_source=${launch ? "launch" : "back_in_stock"}`;
  const name = escapeHtml(productName);
  await dispatch({
    event: launch ? "launched" : "back_in_stock",
    email: a.email ? {
      to: a.email,
      subject: launch ? `${productName} is now available` : `${productName} is back in stock`,
      html: launch
        ? renderEmail({ heading: "Now available", lines: [`<b>${name}</b> has just launched. Stock is limited.`], cta: { label: "Shop now", url } }, "You asked us to tell you when this item launched.")
        : renderEmail({ heading: "Back in stock", lines: [`<b>${name}</b> is back in stock. Stock is limited.`], cta: { label: "Shop now", url } }, "You asked us to tell you when this item returned."),
    } : null,
    whatsapp: a.phone ? (launch
      ? { to: a.phone, template: "vv_launched", params: [productName, url], text: `${productName} has just launched at WonderVastra: ${url}` }
      : { to: a.phone, template: "vv_back_in_stock", params: [productName, url], text: `${productName} is back in stock at WonderVastra: ${url}` }) : null,
  });
}

export function whatsappChatLink(phone: string, text: string) {
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
}
