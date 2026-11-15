/**
 * The 9 am email to the shop owner: what to pack today, parcels waiting for Delhivery, returns to decide,
 * stock running out, yesterday's visitors and sales, and the Delhivery wallet balance.
 * Sent once a day by the cron trigger (see cf-worker.ts and /api/cron?job=daily).
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { money } from "./format";
import { dispatch, renderEmail } from "./notifications";
import { getSettings } from "./settings";
import { walletBalance, walletConfigured } from "./delhivery-wallet";
import { withBrand } from "./utils";

const IST = 5.5 * 3600_000;
/** Midnight IST at the start of the day containing `t`. */
const istMidnight = (t: number) => Math.floor((t + IST) / 86_400_000) * 86_400_000 - IST;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const site = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://wondervastra.in").replace(/\/$/, "");
const ago = (t: number, now: number) => { const h = Math.round((now - t) / 3600_000); return h < 1 ? "just now" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`; };
const table = (head: string[], rows: string[][]) =>
  `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:4px 0 8px"><tr style="background:#f6f1ec">${head.map((h, i) => `<th style="padding:6px 8px;text-align:${i ? "right" : "left"};font-weight:600">${h}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c, i) => `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:${i ? "right" : "left"}">${c}</td>`).join("")}</tr>`).join("")}</table>`;
const h2 = (t: string) => `<b style="font-size:16px;color:#5B1A2A">${t}</b>`;

/** Low-balance line for the wallet: under ₹300, or under what the waiting parcels need. */
export const WALLET_LOW = 30000;

export async function buildDailySummary(now = Date.now()) {
  const { orders, returnRequests, products, variants, pageViews, siteEvents } = schema;
  const today = istMidnight(now), yesterday = today - 86_400_000;

  const [toPack, waiting, returns, stock, ySales, yVisits, yAdds, wallet] = await Promise.all([
    db.select({ id: orders.id, number: orders.number, name: orders.name, total: orders.total, placedAt: orders.placedAt, createdAt: orders.createdAt, status: orders.status, pcs: sql<number>`(select coalesce(sum(qty),0) from order_items where order_id = ${orders.id})` })
      .from(orders).where(and(inArray(orders.status, ["confirmed", "packed"]), isNull(orders.awb))).orderBy(orders.createdAt),
    db.select({ id: orders.id, number: orders.number, name: orders.name, awb: orders.awb, courierStatusAt: orders.courierStatusAt })
      .from(orders).where(and(inArray(orders.status, ["confirmed", "packed"]), isNotNull(orders.awb))).orderBy(orders.createdAt),
    db.select({ id: returnRequests.id, orderId: returnRequests.orderId, status: returnRequests.status, reason: returnRequests.reason, createdAt: returnRequests.createdAt, number: orders.number })
      .from(returnRequests).innerJoin(orders, eq(orders.id, returnRequests.orderId)).where(inArray(returnRequests.status, ["requested", "received"])).orderBy(returnRequests.createdAt),
    db.select({ product: products.name, threshold: products.lowStockThreshold, size: variants.option1, piece: variants.option2, stock: variants.stock })
      .from(variants).innerJoin(products, eq(products.id, variants.productId))
      .where(and(eq(products.status, "active"), eq(variants.active, true), sql`${variants.stock} <= ${products.lowStockThreshold}`)).orderBy(variants.stock),
    db.select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(${orders.total}),0)`, pcs: sql<number>`coalesce(sum((select sum(qty) from order_items where order_id = ${orders.id})),0)` })
      .from(orders).where(and(gte(orders.placedAt, yesterday), lt(orders.placedAt, today), sql`${orders.status} not in ('pending_payment','cancelled')`)),
    db.select({ visitors: sql<number>`count(distinct ${pageViews.sessionId})`, views: sql<number>`count(*)` })
      .from(pageViews).where(and(gte(pageViews.createdAt, yesterday), lt(pageViews.createdAt, today))),
    db.select({ n: sql<number>`count(*)` }).from(siteEvents).where(and(eq(siteEvents.type, "add_to_cart"), gte(siteEvents.createdAt, yesterday), lt(siteEvents.createdAt, today))),
    walletConfigured() ? walletBalance({ fresh: true }) : Promise.resolve(null),
  ]);
  const topViewed = await db.select({ name: products.name, n: sql<number>`count(distinct ${pageViews.sessionId})` })
    .from(pageViews).innerJoin(products, eq(products.id, pageViews.productId))
    .where(and(gte(pageViews.createdAt, yesterday), lt(pageViews.createdAt, today))).groupBy(products.id).orderBy(desc(sql`2`)).limit(3);

  const lines: string[] = [];
  const todo: string[] = [];

  // 1. To pack
  if (toPack.length) {
    todo.push(`${toPack.length} to pack`);
    lines.push(h2(`Pack and ship today: ${toPack.length} ${toPack.length === 1 ? "order" : "orders"}`));
    lines.push(table(["Order", "Pieces", "Placed"], toPack.map((o) => [`<a href="${site()}/admin/orders/${o.id}">${esc(o.number)}</a> · ${esc(o.name)}`, String(o.pcs), ago(o.placedAt ?? o.createdAt, now)])));
  } else lines.push(`${h2("Nothing to pack")}<br>No new orders waiting.`);

  // 2. Booked, waiting for Delhivery to collect
  if (waiting.length) {
    todo.push(`${waiting.length} waiting for pickup`);
    lines.push(h2(`Waiting for Delhivery pickup: ${waiting.length}`) + `<br>Keep these labelled and ready. ` + waiting.map((o) => `<a href="${site()}/admin/orders/${o.id}">${esc(o.number)}</a> (AWB ${esc(o.awb ?? "")})`).join(", "));
  }

  // 3. Returns
  if (returns.length) {
    const ask = returns.filter((r) => r.status === "requested"), refund = returns.filter((r) => r.status === "received");
    todo.push(`${returns.length} ${returns.length === 1 ? "return" : "returns"}`);
    lines.push(h2(`Returns needing you: ${returns.length}`) + "<br>" + [
      ...ask.map((r) => `<a href="${site()}/admin/orders/${r.orderId}#return">${esc(r.number)}</a>: approve or reject (“${esc(r.reason.slice(0, 80))}”, asked ${ago(r.createdAt, now)})`),
      ...refund.map((r) => `<a href="${site()}/admin/orders/${r.orderId}#return">${esc(r.number)}</a>: received back, send the refund`),
    ].join("<br>"));
  }

  // 4. Delhivery wallet
  if (wallet) {
    const low = wallet.balance < WALLET_LOW;
    if (low) todo.unshift("Delhivery wallet low");
    lines.push(h2(`Delhivery wallet: ${money(wallet.balance)}`) + "<br>" + (low
      ? `<span style="color:#A13A1E;font-weight:600">Low. Add money in Delhivery One (Wallet) before booking shipments, or bookings will fail.</span> <a href="https://one.delhivery.com/">Open Delhivery One</a>`
      : "Enough for now. Each parcel costs about ₹40 to ₹60."));
  }

  // 5. Stock
  const out = stock.filter((v) => v.stock <= 0), low = stock.filter((v) => v.stock > 0);
  if (stock.length) {
    lines.push(h2("Stock") + "<br>" + [
      out.length ? `<b>Sold out (${out.length}):</b> ${out.map((v) => `${esc(v.product)} ${esc(v.piece)} ${esc(v.size)}`).join("; ")}` : "",
      low.length ? `<b>Running low (${low.length} sizes at their low-stock mark or below):</b> ${[...new Set(low.map((v) => v.product))].map((p) => { const vs = low.filter((v) => v.product === p); return `${esc(p)} (${vs.length}, lowest ${Math.min(...vs.map((v) => v.stock))} left)`; }).join("; ")}` : "",
    ].filter(Boolean).join("<br>"));
  }

  // 6. Yesterday
  const ys = ySales[0], yv = yVisits[0];
  lines.push(h2("Yesterday") + "<br>" + [
    `<b>${Number(ys?.n ?? 0)}</b> ${Number(ys?.n) === 1 ? "order" : "orders"}${Number(ys?.n) ? ` · ${money(Number(ys.sum))} · ${Number(ys.pcs)} pieces` : ""}`,
    `<b>${Number(yv?.visitors ?? 0)}</b> visitors · ${Number(yv?.views ?? 0)} pages viewed · ${Number(yAdds[0]?.n ?? 0)} added to cart`,
    topViewed.length ? `Most viewed: ${topViewed.map((t) => `${esc(withBrand(t.name, null))} (${t.n})`).join(", ")}` : "",
  ].filter(Boolean).join("<br>"));

  const date = new Date(now + IST).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const subject = `${date}: ${todo.length ? todo.join(", ") : "nothing waiting"} · yesterday ${Number(ys?.n ?? 0)} ${Number(ys?.n) === 1 ? "order" : "orders"}`;
  return { subject, lines, counts: { toPack: toPack.length, waiting: waiting.length, returns: returns.length, walletLow: Boolean(wallet && wallet.balance < WALLET_LOW) } };
}

/** Sends the summary to the shop's alert email, once per IST day (safe to call repeatedly). */
export async function sendDailySummary(now = Date.now(), { force = false } = {}) {
  const s = await getSettings();
  if (!s.dailySummary || !s.adminAlertEmail) return { skipped: "off or no alert email" };
  const today = istMidnight(now);
  if (!force) {
    const [sent] = await db.select({ id: schema.notifications.id }).from(schema.notifications)
      .where(and(eq(schema.notifications.event, "admin_daily_summary"), gte(schema.notifications.createdAt, today))).limit(1);
    if (sent) return { skipped: "already sent today" };
  }
  const m = await buildDailySummary(now);
  await dispatch({
    event: "admin_daily_summary",
    email: { to: s.adminAlertEmail, subject: m.subject, html: renderEmail({ heading: "Good morning. Here's today.", lines: m.lines, cta: { label: "Open orders", url: `${site()}/admin/orders` } }, "Your daily store summary. Turn it off in Admin → Settings.") },
  });
  return { sent: true, ...m.counts };
}
