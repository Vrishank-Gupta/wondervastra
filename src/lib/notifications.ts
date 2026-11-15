import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { money, STATUS_LABEL } from "./format";
import { getSettings } from "./settings";
import { escapeHtml, newId, siteUrl } from "./utils";
import { C, codeBlock, infoBlock, itemsBlock, label, link, noteBlock, productBlock, progressBlock, thumb, renderEmail as renderKit, totalsBlock, type EmailContent } from "./email-kit";

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

type Message = EmailContent & {
  subject: string;
  /** Pre-approved WhatsApp template name and its {{n}} values, in order. */
  template: string;
  params: string[];
  /** Plain text used for one-tap manual WhatsApp sending. */
  text: string;
};

type Line = { name: string; variantLabel: string | null; qty: number; unitPrice: number; unitMrp?: number | null; image?: string | null };

type Ret = typeof schema.returnRequests.$inferSelect;
const RETURN_NOW: Record<string, string> = {
  requested: "We've received your return request and will reply within 1 working day.",
  approved: "Your return is approved. Our courier will pick it up from your address.",
  rejected: "We couldn't accept this return.",
  picked_up: "Your return has been picked up and is on its way to us.",
  received: "We've received your return. Your refund is on its way.",
  completed: "Your refund has been issued.",
};
const RETURN_HEADING: Record<string, string> = {
  requested: "We've got your return request",
  approved: "Return approved, pickup booked",
  rejected: "About your return request",
  picked_up: "Your return is on its way to us",
  received: "We've received your return",
  completed: "Your refund has been issued",
};
const day = (t: number) => new Date(t + 5.5 * 3600_000).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const STEP: Partial<Record<OrderEventName, number>> = { order_placed: 0, order_packed: 1, order_shipped: 2, tracking_updated: 2, out_for_delivery: 3, order_delivered: 4 };

export function buildOrderMessage(event: OrderEventName, o: Order, opts: { orderFeedback: boolean; deliveryFeedback: boolean; items?: Line[]; ret?: Ret | null; returnDays?: number }): Message {
  const first = o.name.split(" ")[0];
  const track = trackingLink(o);
  const shipLine = [o.courier, o.awb ? `AWB ${o.awb}` : null].filter(Boolean).join(" · ");
  const items = opts.items ?? [];
  const pieces = items.reduce((a, i) => a + i.qty, 0);
  const eyebrow = `Order ${o.number}`;
  const progress = STEP[event] != null ? progressBlock(STEP[event]!) : null;
  const itemList = items.length ? itemsBlock(items, pieces ? `Your items (${pieces} ${pieces === 1 ? "piece" : "pieces"})` : "Your items") : null;
  const address = `${escapeHtml(o.name)}<br>${escapeHtml([o.line1, o.line2].filter(Boolean).join(", "))}<br>${escapeHtml(o.city)}, ${escapeHtml(o.state)} ${escapeHtml(o.pincode)}`;
  const paid = o.paymentMethod === "cod" ? `Cash on delivery: ${money(o.total)}` : `Paid online: ${money(o.total)}`;
  const eta = o.etaAt && !o.deliveredAt ? noteBlock(`<b>Arriving by ${day(o.etaAt)}</b>${o.etaAt ? "" : ""}`, "good") : null;
  const fill = (xs: (string | null | false | undefined)[]) => xs.filter(Boolean) as string[];
  switch (event) {
    case "order_placed": {
      const fb = feedbackLink(o, "order");
      return {
        subject: `Order ${o.number} confirmed`,
        preheader: `${pieces ? `${pieces} ${pieces === 1 ? "piece" : "pieces"}, ` : ""}${money(o.total)}. ${o.etaAt ? `Arriving by ${day(o.etaAt)}.` : "We'll tell you when it ships."}`,
        eyebrow,
        heading: `Thank you, ${first}! Your order is confirmed.`,
        lines: fill([
          progress,
          eta,
          itemList,
          items.length ? totalsBlock({ subtotal: o.subtotal, mrpTotal: o.mrpTotal, offerName: o.offerName, offerDiscount: o.offerDiscount, couponCode: o.couponCode, couponDiscount: o.couponDiscount, shipping: o.shippingTotal, codFee: o.codFee, total: o.total, paidLabel: o.paymentMethod === "cod" ? "To pay on delivery" : "Total paid" }) : null,
          infoBlock([["Delivering to", address], ["Payment", escapeHtml(paid)]]),
          "We're packing it now and will email you as soon as it ships.",
          opts.orderFeedback ? `<span style="font-size:14px;color:${C.soft}">How was ordering from us? ${link("Tell us in 10 seconds", fb)}</span>` : null,
        ]),
        cta: { label: "Track your order", url: track },
        template: "vv_order_placed",
        params: [first, o.number, money(o.total), track, fb],
        text: `Hi ${first}, your WonderVastra order ${o.number} for ${money(o.total)} is confirmed\nTrack it: ${track}${opts.orderFeedback ? `\nHow was ordering from us? ${fb}` : ""}`,
      };
    }
    case "order_packed":
      return {
        subject: `Order ${o.number} is packed`,
        preheader: "Packed and ready for the courier.",
        eyebrow,
        heading: "All packed and ready to go",
        lines: fill([progress, `Your order is packed and will be handed to the courier shortly. We'll send the tracking details as soon as it's picked up.`, eta, itemList]),
        cta: { label: "View your order", url: track },
        template: "vv_order_packed",
        params: [first, o.number, track],
        text: `Hi ${first}, your WonderVastra order ${o.number} is packed\nDetails: ${track}`,
      };
    case "order_shipped":
    case "tracking_updated": {
      const linkUrl = parcelLink(o);
      const updated = event === "tracking_updated";
      return {
        subject: updated ? `New tracking details for ${o.number}` : `Order ${o.number} has shipped`,
        preheader: o.etaAt ? `Arriving by ${day(o.etaAt)}.` : "Track it any time.",
        eyebrow,
        heading: updated ? "Your tracking details changed" : "Your order is on its way",
        lines: fill([
          progress,
          eta,
          shipLine ? infoBlock([["Courier", escapeHtml(o.courier ?? "Courier")], ...(o.awb ? [["Tracking number (AWB)", `<b style="font-family:Menlo,Consolas,monospace;letter-spacing:.5px">${escapeHtml(o.awb)}</b>`] as [string, string]] : [])]) : null,
          updated ? "The courier updated the tracking details for your parcel. Use the button below for the latest status." : "Good news: your parcel has left us. Track it live with the button below.",
          itemList,
        ]),
        cta: { label: "Track your parcel", url: linkUrl },
        secondary: { label: "View order", url: track },
        template: "vv_order_shipped",
        params: [first, o.number, o.courier || "our courier partner", o.awb || "-", linkUrl],
        text: `Hi ${first}, your WonderVastra order ${o.number} ${updated ? "has new tracking details" : "has shipped"}${shipLine ? `\n${shipLine}` : ""}\nTrack it: ${linkUrl}`,
      };
    }
    case "out_for_delivery":
      return {
        subject: `Order ${o.number} is out for delivery today`,
        preheader: "Arriving today. Please keep your phone handy.",
        eyebrow,
        heading: "Arriving today!",
        lines: fill([
          progress,
          `Your parcel is out for delivery. Please keep your phone handy so the delivery partner can reach you.`,
          o.paymentMethod === "cod" && o.paymentStatus !== "paid" ? noteBlock(`Please keep <b>${money(o.total)}</b> ready to pay on delivery.`, "warn") : null,
          infoBlock([["Delivering to", address]]),
        ]),
        cta: { label: "Track your parcel", url: parcelLink(o) },
        template: "vv_out_for_delivery",
        params: [first, o.number, parcelLink(o)],
        text: `Hi ${first}, your WonderVastra order ${o.number} is out for delivery${o.paymentMethod === "cod" ? `\nPlease keep ${money(o.total)} ready.` : ""}\nTrack it: ${parcelLink(o)}`,
      };
    case "order_delivered": {
      const fb = feedbackLink(o, "delivery");
      const days = opts.returnDays ?? 0;
      const until = days > 0 && o.deliveredAt ? o.deliveredAt + days * 86_400_000 : null;
      return {
        subject: `Delivered! How did we do, ${first}?`,
        preheader: "Your order has been delivered. Stay warm!",
        eyebrow,
        heading: "Delivered. Stay warm!",
        lines: fill([
          progress,
          `Your order has been delivered. We hope everyone loves their new thermals.`,
          opts.deliveryFeedback ? "Got a moment? Rate your items and your delivery. It helps other families choose the right size." : null,
          until ? noteBlock(`Not the right fit? You can return unused items until <b>${day(until)}</b>. Start it from your order page with a photo.`, "plain") : null,
          itemList,
        ]),
        cta: opts.deliveryFeedback ? { label: "Rate your order", url: fb } : { label: "View your order", url: track },
        secondary: opts.deliveryFeedback ? { label: "View order", url: track } : undefined,
        template: "vv_order_delivered",
        params: [first, o.number, fb],
        text: `Hi ${first}, your WonderVastra order ${o.number} has been delivered${opts.deliveryFeedback ? `\nHow did we do? ${fb}` : ""}`,
      };
    }
    case "order_cancelled":
      return {
        subject: `Order ${o.number} was cancelled`,
        preheader: o.paymentStatus === "paid" ? "Your refund will go back to your original payment method." : "Your order was cancelled.",
        eyebrow,
        heading: "Your order was cancelled",
        lines: fill([
          `Order <b>${escapeHtml(o.number)}</b> has been cancelled.`,
          o.paymentStatus === "paid" || o.paymentStatus === "refunded" || o.paymentStatus === "partially_refunded" ? noteBlock(`Your refund of <b>${money(o.total)}</b> goes back to your original payment method. Banks usually take 5–7 working days to show it.`, "good") : null,
          itemList,
          "Changed your mind? You can order again any time.",
        ]),
        cta: { label: "Shop again", url: `${siteUrl()}/shop` },
        secondary: { label: "View order", url: track },
        template: "vv_order_cancelled",
        params: [first, o.number, track],
        text: `Hi ${first}, your WonderVastra order ${o.number} has been cancelled.${o.paymentStatus === "paid" ? " Your refund will be processed to your original payment method." : ""}\nDetails: ${track}`,
      };
    case "order_refunded":
      return {
        subject: `Refund of ${money(o.refundedTotal)} processed for ${o.number}`,
        preheader: "Banks usually take 5–7 working days to show it.",
        eyebrow,
        heading: "Your refund is on its way",
        lines: [
          infoBlock([["Refund amount", `<b style="font-size:20px">${money(o.refundedTotal)}</b>`], ["Refunded to", "Your original payment method"], ["When you'll see it", "Usually 5–7 working days, depending on your bank"]]),
          "If you don't see it after 7 working days, reply to this email and we'll help.",
        ],
        cta: { label: "View your order", url: track },
        template: "vv_order_refunded",
        params: [first, money(o.refundedTotal), o.number, track],
        text: `Hi ${first}, we've refunded ${money(o.refundedTotal)} for your WonderVastra order ${o.number}. Banks usually take 5–7 working days to show it.\nDetails: ${track}`,
      };
    case "return_update": {
      const r = opts.ret;
      const now = r ? RETURN_NOW[r.status] ?? STATUS_LABEL[o.status] : `Your order is now: ${STATUS_LABEL[o.status] ?? o.status}.`;
      const extra = r?.status === "rejected" && r.adminNote ? ` Reason: ${r.adminNote}` : r?.status === "approved" && r.pickupAwb ? ` Pickup AWB ${r.pickupAwb}.` : "";
      const steps = ["requested", "approved", "picked_up", "received", "completed"];
      const at = r ? steps.indexOf(r.status) : -1;
      const tracker = at >= 0 ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${["Requested", "Approved", "Picked up", "Received", "Refunded"].map((s, i) => `<td width="20%" align="center" valign="top" style="padding:0 2px"><div style="height:4px;background:${i <= at ? C.maroon : C.line};border-radius:2px;margin-bottom:8px"></div><span style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:11px;color:${i === at ? C.maroon : i < at ? C.ink : C.faint};font-weight:${i === at ? 700 : 500}">${s}</span></td>`).join("")}</tr></table>` : null;
      return {
        subject: r?.status === "completed" ? `Refund issued for your return on ${o.number}` : `Update on your return for ${o.number}`,
        preheader: now,
        eyebrow: `Return · Order ${o.number}`,
        heading: r ? RETURN_HEADING[r.status] ?? "Return update" : "Return update",
        lines: fill([
          tracker,
          noteBlock(escapeHtml(now), r?.status === "rejected" ? "bad" : r?.status === "completed" || r?.status === "approved" ? "good" : "plain"),
          r?.status === "rejected" && r.adminNote ? infoBlock([["Reason", escapeHtml(r.adminNote)]]) : null,
          r?.status === "approved" ? `Please keep the items packed in their original packaging. The courier will collect them from <b>${escapeHtml(o.city)}</b>${r.pickupAwb ? ` (pickup AWB <b>${escapeHtml(r.pickupAwb)}</b>)` : ""}.` : null,
          r?.status === "rejected" ? "If you think this is a mistake, reply to this email with a photo and we'll take another look." : null,
        ]),
        cta: { label: "View your return", url: `${track}#return` },
        template: "vv_return_update",
        params: [first, o.number, now + extra, track],
        text: `Hi ${first}, return update for your WonderVastra order ${o.number}: ${now}${extra}\nDetails: ${track}`,
      };
    }
  }
}

export function renderEmail(m: EmailContent, footer: string, opts: { audience?: "customer" | "admin"; supportEmail?: string } = {}) {
  return renderKit(m, footer, opts);
}

/** Plain-text twin of an HTML email. Mail apps and spam filters both like having one. */
function toText(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, "$2: $1").replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/(p|h1|div|tr)>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n\n");
}

async function sendEmail(to: string, subject: string, html: string, replyToOverride?: string) {
  // Replies go to the shop's real mailbox (or, for a contact message, to the customer); the sending address has no inbox.
  const replyTo = replyToOverride || (await getSettings()).supportEmail || undefined;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "WonderVastra <onboarding@resend.dev>", to, subject, html, text: toText(html), ...(replyTo ? { reply_to: replyTo } : {}) }),
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
  email?: { to: string; subject: string; html: string; replyTo?: string } | null;
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
      try { providerId = await sendEmail(d.email.to, d.email.subject, d.email.html, d.email.replyTo); status = "sent"; }
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

type AdminItem = Line & { sku?: string | null };

/** To the owner when an order comes in: a packing checklist with photos, who it's for, and where it goes. */
export function adminNewOrderEmail(o: Order, items: AdminItem[]) {
  const pieces = items.reduce((a, i) => a + i.qty, 0);
  const admin = `${siteUrl()}/admin/orders/${o.id}`;
  const phone = o.phone.replace(/\D/g, "").slice(-10);
  const pack = `<div>${label(`Pack these ${pieces} ${pieces === 1 ? "piece" : "pieces"}`)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map((i, n) => {
    const img = thumb(i.image);
    return `<tr><td width="30" valign="middle" style="padding:${n ? 10 : 0}px 10px 0 0"><div style="width:22px;height:22px;border:2px solid ${C.line};border-radius:3px"></div></td>
<td width="60" valign="top" style="padding:${n ? 10 : 0}px 12px 0 0">${img ? `<img src="${escapeHtml(img)}" width="52" height="65" alt="" style="display:block;width:52px;height:65px;border:1px solid ${C.line}">` : ""}</td>
<td valign="top" style="padding:${n ? 10 : 0}px 0 0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.4;color:${C.ink}"><b>${escapeHtml(i.name)}</b><br><span style="font-size:13px;color:${C.soft}">${escapeHtml(i.variantLabel ?? "")}</span>${i.sku ? `<br><span style="font-family:Menlo,Consolas,monospace;font-size:12px;color:${C.faint}">${escapeHtml(i.sku)}</span>` : ""}</td>
<td valign="top" align="right" style="padding:${n ? 10 : 0}px 0 0 8px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;white-space:nowrap"><span style="display:inline-block;min-width:34px;text-align:center;background:${C.deep};color:#fff;font-size:15px;font-weight:700;padding:6px 8px;border-radius:3px">×${i.qty}</span></td></tr>`;
  }).join("")}</table></div>`;
  return {
    subject: `New order ${o.number}: pack ${pieces} ${pieces === 1 ? "piece" : "pieces"} · ${money(o.total)} ${o.paymentMethod === "cod" ? "COD" : "paid"}`,
    html: renderEmail({
      eyebrow: "Store alert · New order",
      preheader: `${o.name}, ${o.city} · ${pieces} ${pieces === 1 ? "piece" : "pieces"} · ${money(o.total)}`,
      heading: `New order ${o.number}`,
      lines: [
        noteBlock(`<b>${money(o.total)}</b> · ${o.paymentMethod === "cod" ? "Cash on delivery: collect on delivery" : `Paid online${o.paymentStatus === "paid" ? "" : ` (${escapeHtml(o.paymentStatus)})`}`}${o.offerName ? ` · ${escapeHtml(o.offerName)}` : ""}${o.couponCode ? ` · coupon ${escapeHtml(o.couponCode)}` : ""}`, "good"),
        pack,
        infoBlock([
          ["Customer", `<b>${escapeHtml(o.name)}</b><br><a href="tel:+91${phone}" style="color:${C.maroon}">${escapeHtml(o.phone)}</a> · <a href="https://wa.me/91${phone}" style="color:${C.maroon}">WhatsApp</a><br><a href="mailto:${escapeHtml(o.email)}" style="color:${C.maroon}">${escapeHtml(o.email)}</a>`],
          ["Ship to", `${escapeHtml([o.line1, o.line2].filter(Boolean).join(", "))}<br>${escapeHtml(o.city)}, ${escapeHtml(o.state)} <b>${escapeHtml(o.pincode)}</b>`],
          ...(o.customerNote ? [["Customer note", escapeHtml(o.customerNote)] as [string, string]] : []),
        ]),
        `<b>Next:</b> pack the pieces above, then open the order and tap <b>Ship with Delhivery</b>. It books the courier and the pickup, and gives you the label to print.`,
      ],
      cta: { label: "Open order and ship", url: `${admin}#delhivery` },
    }, "Store alert: a new order on WonderVastra.", { audience: "admin" }),
  };
}

/** To the owner when a customer asks to return items. */
export function adminReturnEmail(o: Order, ret: Ret, items: AdminItem[]) {
  const chosen = ret.items?.length ? ret.items.map((x) => { const it = (items as (AdminItem & { id?: string })[]).find((i) => i.id === x.itemId); return it ? { ...it, qty: x.qty } : null; }).filter(Boolean) as AdminItem[] : items;
  return {
    subject: `Return request on ${o.number}: decide within 1 working day`,
    html: renderEmail({
      eyebrow: "Store alert · Return request",
      preheader: `${o.name}: ${ret.reason}`,
      heading: `${o.name.split(" ")[0]} wants to return items`,
      lines: [
        infoBlock([["Order", `<b>${escapeHtml(o.number)}</b> · ${money(o.total)}`], ["Reason", escapeHtml(ret.reason)], ...(ret.details ? [["Customer says", escapeHtml(ret.details)] as [string, string]] : []), ["Photos", ret.photos?.length ? `${ret.photos.length} attached, see them in admin` : "None"]]),
        chosen.length ? itemsBlock(chosen, "Items to return") : "",
        `Check the photos, then <b>Approve</b> (books a Delhivery pickup from the customer) or <b>Reject</b> with a reason. The customer was told to expect an answer within 1 working day.`,
      ].filter(Boolean),
      cta: { label: "Review the return", url: `${siteUrl()}/admin/orders/${o.id}#return` },
    }, "Store alert: a return request on WonderVastra.", { audience: "admin" }),
  };
}

export async function notifyOrder(orderId: string, event: OrderEventName) {
  try {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (!o) return;
    const s = await getSettings();
    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    const ret = event === "return_update" ? (await db.select().from(schema.returnRequests).where(eq(schema.returnRequests.orderId, orderId)).orderBy(desc(schema.returnRequests.createdAt)).limit(1))[0] ?? null : null;
    const m = buildOrderMessage(event, o, { orderFeedback: s.orderFeedbackEnabled, deliveryFeedback: s.deliveryFeedbackEnabled, items, ret, returnDays: s.returnWindowDays });
    await dispatch({
      orderId,
      event,
      email: { to: o.email, subject: m.subject, html: renderEmail(m, `You're receiving this because you ordered from ${s.storeName}.`, { supportEmail: s.supportEmail }) },
      whatsapp: o.whatsappOptIn ? { to: o.phone, template: m.template, params: m.params, text: m.text } : null,
    });
    if (event === "return_update" && ret?.status === "requested" && s.adminAlertEmail) {
      const a = adminReturnEmail(o, ret, items);
      await dispatch({ orderId, event: "admin_return_request", email: { to: s.adminAlertEmail, subject: a.subject, html: a.html } });
    }
    if (event === "order_placed" && s.adminAlertEmail) {
      const a = adminNewOrderEmail(o, items);
      await dispatch({ orderId, event: "admin_new_order", email: { to: s.adminAlertEmail, subject: a.subject, html: a.html } });
    }
    // A copy of the new-order email to a second inbox (e.g. the owner's personal email).
    if (event === "order_placed" && s.orderCopyEmail && s.orderCopyEmail.toLowerCase() !== s.adminAlertEmail.toLowerCase()) {
      const a = adminNewOrderEmail(o, items);
      await dispatch({ orderId, event: "admin_new_order_copy", email: { to: s.orderCopyEmail, subject: a.subject, html: a.html } });
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

export function otpEmail(code: string) {
  return {
    subject: `${code} is your WonderVastra login code`,
    html: renderEmail({
      preheader: `Your code is ${code}. It expires in 10 minutes.`,
      heading: "Your login code",
      lines: [codeBlock(code), "Enter this code on WonderVastra to log in. It expires in <b>10 minutes</b>.", `<span style="font-size:13px;color:${C.soft}">Didn't ask for this? You can ignore this email. Your account is safe.</span>`],
    }, "Never share this code with anyone, not even with us."),
  };
}

export async function sendOtpMessage(identifier: string, code: string) {
  const isEmail = identifier.includes("@");
  const m = otpEmail(code);
  await dispatch(isEmail
    ? { event: "login_otp", email: { to: identifier, subject: m.subject, html: m.html } }
    : { event: "login_otp", whatsapp: { to: identifier, template: "vv_login_otp", params: [code], text: `Your WonderVastra login code is ${code}` } });
}

export type StockProduct = { image?: string | null; price?: number | null; mrp?: number | null };
export function backInStockEmail(productName: string, slug: string, launch: boolean, p: StockProduct = {}, supportEmail?: string) {
  const url = `${siteUrl()}/p/${slug}?utm_source=${launch ? "launch" : "back_in_stock"}`;
  return {
    subject: launch ? `${productName} is now available` : `Good news: ${productName} is back in stock`,
    html: renderEmail({
      eyebrow: launch ? "Just launched" : "Back in stock",
      preheader: launch ? "It's here. Stock is limited." : "The item you asked about is available again. Stock is limited.",
      heading: launch ? "It's here!" : "It's back in stock",
      lines: [
        launch ? "You asked us to tell you when this launched. It's available now:" : "You asked us to tell you when this was available again. It's back:",
        productBlock({ name: productName, image: p.image, price: p.price, mrp: p.mrp, url }),
        noteBlock("Stock is limited and sizes go fast. Free delivery in Delhi NCR.", "warn"),
      ],
      cta: { label: launch ? "Shop now" : "Get yours", url },
    }, launch ? "You asked us to tell you when this item launched." : "You asked us to tell you when this item returned.", { supportEmail }),
  };
}

export async function sendBackInStock(a: { email: string | null; phone: string | null }, productName: string, slug: string, launch = false, p: StockProduct = {}) {
  const url = `${siteUrl()}/p/${slug}?utm_source=${launch ? "launch" : "back_in_stock"}`;
  const m = a.email ? backInStockEmail(productName, slug, launch, p, (await getSettings()).supportEmail) : null;
  await dispatch({
    event: launch ? "launched" : "back_in_stock",
    email: a.email && m ? { to: a.email, subject: m.subject, html: m.html } : null,
    whatsapp: a.phone ? (launch
      ? { to: a.phone, template: "vv_launched", params: [productName, url], text: `${productName} has just launched at WonderVastra: ${url}` }
      : { to: a.phone, template: "vv_back_in_stock", params: [productName, url], text: `${productName} is back in stock at WonderVastra: ${url}` }) : null,
  });
}

/** Contact form message to the support inbox. Replying answers the customer. */
export function contactEmail(f: { name: string; email: string; phone: string; order: string; message: string }) {
  return {
    subject: `Message from ${f.name}${f.order ? ` about ${f.order}` : ""}`,
    html: renderEmail({
      eyebrow: "Store alert · Contact form",
      preheader: f.message.slice(0, 110),
      heading: `New message from ${f.name.split(" ")[0]}`,
      lines: [
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:4px solid ${C.gold};background:${C.sand};padding:14px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:${C.ink}">${escapeHtml(f.message.trim()).replace(/\n/g, "<br>")}</td></tr></table>`,
        infoBlock([
          ["From", `<b>${escapeHtml(f.name)}</b><br><a href="mailto:${escapeHtml(f.email)}" style="color:${C.maroon}">${escapeHtml(f.email)}</a>${f.phone ? ` · <a href="tel:${escapeHtml(f.phone)}" style="color:${C.maroon}">${escapeHtml(f.phone)}</a>` : ""}`],
          ...(f.order ? [["Order", `<b>${escapeHtml(f.order)}</b>`] as [string, string]] : []),
        ]),
        `<b>Just hit Reply</b> to answer: your reply goes straight to ${escapeHtml(f.email)}.`,
      ],
    }, "Sent from the contact form on wondervastra.in.", { audience: "admin" }),
  };
}

export function whatsappChatLink(phone: string, text: string) {
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
}
