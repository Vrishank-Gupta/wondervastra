/**
 * The look of every email the store sends: brand header with the logo, one white card, clear blocks
 * (items with photos, price summary, progress, info rows, notes), and a helpful footer.
 * Email clients only understand tables and inline styles, so everything here is built that way.
 * Colours come from the Lotus Crown logo: deep maroon, gold, ivory.
 */
import { money } from "./format";
import { escapeHtml, siteUrl } from "./utils";

export const C = {
  page: "#F4EEE6", card: "#FFFFFF", ink: "#1E1517", soft: "#6E6266", faint: "#9A8F92", line: "#ECE3D8",
  deep: "#2A0E16", maroon: "#7A1F35", gold: "#B8913F", sand: "#FAF5EE",
  pine: "#1F6B4A", pineSoft: "#E6F2EB", clay: "#A13A1E", claySoft: "#FBEAE4", amber: "#8A5A00", amberSoft: "#FDF3DC",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const e = escapeHtml;

/** Product photos, small and padded white so whole garments show (Cloudinary resizes them). */
export function thumb(url: string | null | undefined, w = 112, h = 140) {
  if (!url) return null;
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) return url.replace("/upload/", `/upload/w_${w},h_${h},c_pad,b_white,q_auto,f_jpg/`);
  return url.startsWith("http") ? url : `${siteUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function button(c: { label: string; url: string }, tone: "primary" | "secondary" = "primary") {
  const bg = tone === "primary" ? C.maroon : C.card, fg = tone === "primary" ? "#FFFFFF" : C.maroon;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0"><tr><td style="background:${bg};border:1.5px solid ${C.maroon};border-radius:3px">
<a href="${e(c.url)}" style="display:inline-block;padding:13px 24px;white-space:nowrap;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:.2px;color:${fg};text-decoration:none">${e(c.label)}</a></td></tr></table>`;
}

/** A small uppercase label above a block. */
export const label = (t: string) => `<p style="margin:0 0 8px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.soft}">${e(t)}</p>`;

export type EmailItem = { name: string; variantLabel?: string | null; qty: number; unitPrice: number; unitMrp?: number | null; image?: string | null };
/** Items with photos: name, size and piece, quantity, and the line total (MRP struck through when lower). */
export function itemsBlock(items: EmailItem[], heading = "Your items") {
  const rows = items.map((i, n) => {
    const img = thumb(i.image);
    const mrp = i.unitMrp && i.unitMrp > i.unitPrice ? i.unitMrp * i.qty : null;
    return `<tr>
<td width="64" valign="top" style="padding:${n ? 12 : 0}px 12px 0 0">${img ? `<img src="${e(img)}" width="56" height="70" alt="" style="display:block;width:56px;height:70px;border:1px solid ${C.line};border-radius:2px;background:#fff">` : `<div style="width:56px;height:70px;background:${C.sand};border:1px solid ${C.line}"></div>`}</td>
<td valign="top" style="padding:${n ? 12 : 0}px 0 0;font-family:${FONT};font-size:14px;line-height:1.4;color:${C.ink}">
<b>${e(i.name)}</b>${i.variantLabel ? `<br><span style="color:${C.soft};font-size:13px">${e(i.variantLabel)}</span>` : ""}<br><span style="color:${C.soft};font-size:13px">Qty ${i.qty}</span></td>
<td valign="top" align="right" style="padding:${n ? 12 : 0}px 0 0 8px;font-family:${FONT};font-size:14px;white-space:nowrap;color:${C.ink}"><b>${money(i.unitPrice * i.qty)}</b>${mrp ? `<br><s style="color:${C.faint};font-size:12px">${money(mrp)}</s>` : ""}</td></tr>`;
  }).join("");
  return `<div>${label(heading)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></div>`;
}

/** Price summary: items, savings, offer, delivery, total. */
export function totalsBlock(t: { subtotal: number; mrpTotal?: number | null; offerName?: string | null; offerDiscount?: number; couponCode?: string | null; couponDiscount?: number; shipping: number; codFee?: number; total: number; paidLabel?: string }) {
  const row = (l: string, v: string, style = "") => `<tr><td style="padding:3px 0;font-family:${FONT};font-size:14px;color:${C.soft};${style}">${l}</td><td align="right" style="padding:3px 0;font-family:${FONT};font-size:14px;color:${C.ink};white-space:nowrap;${style}">${v}</td></tr>`;
  const saved = (t.mrpTotal ?? 0) - t.subtotal + (t.offerDiscount ?? 0) + (t.couponDiscount ?? 0);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};padding-top:10px;margin-top:4px">
${row("Items", money(t.subtotal))}
${t.offerDiscount ? row(`Extra offer${t.offerName ? ` (${e(t.offerName)})` : ""}`, `−${money(t.offerDiscount)}`, `color:${C.pine}`) : ""}
${t.couponDiscount ? row(`Coupon ${e(t.couponCode ?? "")}`, `−${money(t.couponDiscount)}`, `color:${C.pine}`) : ""}
${row("Delivery", t.shipping ? money(t.shipping) : `<span style="color:${C.pine};font-weight:600">Free</span>`)}
${t.codFee ? row("Cash on delivery fee", money(t.codFee)) : ""}
<tr><td style="padding:10px 0 0;border-top:1px solid ${C.line};font-family:${FONT};font-size:16px;font-weight:700;color:${C.ink}">${e(t.paidLabel ?? "Total")}</td><td align="right" style="padding:10px 0 0;border-top:1px solid ${C.line};font-family:${FONT};font-size:18px;font-weight:700;color:${C.ink}">${money(t.total)}</td></tr>
${saved > 0 ? `<tr><td colspan="2" style="padding:8px 0 0"><span style="display:inline-block;background:${C.pineSoft};color:${C.pine};font-family:${FONT};font-size:13px;font-weight:700;padding:5px 10px;border-radius:2px">You saved ${money(saved)} on MRP</span></td></tr>` : ""}
</table>`;
}

/** Order progress: Confirmed → Packed → Shipped → Out for delivery → Delivered. */
export function progressBlock(step: number) {
  const steps = ["Confirmed", "Packed", "Shipped", "Out for delivery", "Delivered"];
  const cells = steps.map((s, i) => {
    const done = i <= step, now = i === step;
    return `<td width="20%" align="center" valign="top" style="padding:0 2px">
<div style="height:4px;background:${done ? C.maroon : C.line};border-radius:2px;margin-bottom:8px"></div>
<span style="font-family:${FONT};font-size:11px;line-height:1.25;color:${now ? C.maroon : done ? C.ink : C.faint};font-weight:${now ? 700 : 500}">${s}</span></td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${cells}</tr></table>`;
}

/** Label / value rows, e.g. Delivering to, Payment, Order number. */
export function infoBlock(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.sand};border:1px solid ${C.line};border-radius:3px">
${rows.map(([l, v], i) => `<tr><td style="padding:${i ? 0 : 14}px 16px ${i === rows.length - 1 ? 14 : 10}px;font-family:${FONT};font-size:14px;line-height:1.45;color:${C.ink}"><span style="display:block;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${C.soft}">${e(l)}</span>${v}</td></tr>`).join("")}
</table>`;
}

/** A coloured note: good news, a warning, or something to act on. */
export function noteBlock(html: string, tone: "good" | "warn" | "bad" | "plain" = "plain") {
  const [bg, fg, bar] = tone === "good" ? [C.pineSoft, C.pine, C.pine] : tone === "warn" ? [C.amberSoft, C.amber, "#D99A1E"] : tone === "bad" ? [C.claySoft, C.clay, C.clay] : [C.sand, C.ink, C.gold];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${bg};border-left:4px solid ${bar};padding:12px 14px;font-family:${FONT};font-size:14px;line-height:1.5;color:${fg}">${html}</td></tr></table>`;
}

/** A big, easy-to-copy code (login codes). */
export function codeBlock(code: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0"><tr><td style="background:${C.sand};border:1px dashed ${C.gold};border-radius:3px;padding:14px 22px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:${C.deep}">${e(code)}</td></tr></table>`;
}

/** One product with photo and price (back in stock, launches). */
export function productBlock(p: { name: string; image?: string | null; price?: number | null; mrp?: number | null; url: string }) {
  const img = thumb(p.image, 240, 300);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:3px"><tr>
${img ? `<td width="132" valign="top" style="padding:12px"><a href="${e(p.url)}"><img src="${e(img)}" width="120" height="150" alt="" style="display:block;width:120px;height:150px;background:#fff"></a></td>` : ""}
<td valign="middle" style="padding:12px 14px 12px ${img ? 0 : 14}px;font-family:${FONT};color:${C.ink}"><a href="${e(p.url)}" style="color:${C.ink};text-decoration:none;font-size:16px;font-weight:700;line-height:1.35">${e(p.name)}</a>
${p.price ? `<p style="margin:8px 0 0;font-size:15px"><b>${money(p.price)}</b>${p.mrp && p.mrp > p.price ? ` <s style="color:${C.faint};font-size:13px">${money(p.mrp)}</s> <span style="color:${C.pine};font-size:13px;font-weight:700">${Math.round(((p.mrp - p.price) / p.mrp) * 100)}% off</span>` : ""}</p>` : ""}</td></tr></table>`;
}

/** A plain text link in brand colour. */
export const link = (text: string, url: string) => `<a href="${e(url)}" style="color:${C.maroon};font-weight:600;text-decoration:underline">${e(text)}</a>`;

/** Blocks start with "<" + table/div: placed as they are. Anything else is a paragraph. */
const isBlock = (l: string) => /^\s*<(table|div)/i.test(l);

export type EmailContent = {
  heading: string;
  lines: string[];
  cta?: { label: string; url: string };
  secondary?: { label: string; url: string };
  /** Shown in the inbox list after the subject. */
  preheader?: string;
  /** Small label above the heading, e.g. the order number or "Store alert". */
  eyebrow?: string;
};

/**
 * The whole email. `footer` says why they got it. `audience` "admin" swaps the customer help footer
 * for a short store-alert one.
 */
export function renderEmail(m: EmailContent, footer: string, opts: { audience?: "customer" | "admin"; supportEmail?: string } = {}) {
  const site = siteUrl();
  const admin = opts.audience === "admin" || /store alert|daily store summary/i.test(footer);
  const body = m.lines.map((l) => isBlock(l)
    ? `<tr><td style="padding:0 0 18px">${l}</td></tr>`
    : `<tr><td style="padding:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink}">${l}</td></tr>`).join("");
  const help = admin
    ? `<a href="${site}/admin" style="color:${C.soft}">Open admin</a>`
    : `Questions? Just reply to this email${opts.supportEmail ? ` or write to <a href="mailto:${e(opts.supportEmail)}" style="color:${C.soft}">${e(opts.supportEmail)}</a>` : ""}.<br>
<a href="${site}/shop" style="color:${C.soft}">Shop</a> &nbsp;·&nbsp; <a href="${site}/track" style="color:${C.soft}">Track an order</a> &nbsp;·&nbsp; <a href="${site}/info/returns-policy" style="color:${C.soft}">Returns</a> &nbsp;·&nbsp; <a href="${site}/info/contact" style="color:${C.soft}">Help</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${e(m.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
${m.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${e(m.preheader)}${"&#8204;&nbsp;".repeat(60)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="background:${C.deep};padding:20px 24px 16px;border-radius:4px 4px 0 0">
<a href="${site}" style="text-decoration:none"><img src="${site}/brand/email-logo.png" width="120" height="102" alt="WonderVastra" style="display:block;width:120px;height:102px;border:0;color:#F3E7D3;font-family:${SERIF};font-size:22px;letter-spacing:3px"></a></td></tr>
<tr><td style="height:3px;background:${C.gold};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="background:${C.card};padding:30px 28px 14px;border:1px solid ${C.line};border-top:0;border-radius:0 0 4px 4px">
${m.eyebrow ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${admin ? C.gold : C.soft}">${e(m.eyebrow)}</p>` : ""}
<h1 style="margin:0 0 18px;font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:400;color:${C.deep}">${e(m.heading)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}
${m.cta ? `<tr><td style="padding:4px 0 ${m.secondary ? 10 : 20}px">${button(m.cta)}</td></tr>` : ""}
${m.secondary ? `<tr><td style="padding:0 0 20px;font-family:${FONT};font-size:14px"><a href="${e(m.secondary.url)}" style="color:${C.maroon};font-weight:600">${e(m.secondary.label)} →</a></td></tr>` : ""}
</table></td></tr>
<tr><td align="center" style="padding:20px 16px 0;font-family:${FONT};font-size:12px;line-height:1.7;color:${C.soft}">
${help}<br><span style="color:${C.faint}">${e(footer)}</span><br><span style="color:${C.faint}">WonderVastra · 100% original thermals · Delhi NCR</span></td></tr>
</table></td></tr></table></body></html>`;
}
