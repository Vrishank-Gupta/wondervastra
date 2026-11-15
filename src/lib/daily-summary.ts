/**
 * The 9 am email to the shop owner: what to pack today, parcels waiting for Delhivery, returns to decide,
 * the Delhivery wallet, stock left per size, and yesterday's visitors and sales.
 * Sent once a day by the cron trigger (see cf-worker.ts and /api/cron?job=daily).
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { money } from "./format";
import { dispatch, renderEmail } from "./notifications";
import { C, infoBlock, label, noteBlock } from "./email-kit";
import { getSettings } from "./settings";
import { walletBalance, walletConfigured } from "./delhivery-wallet";
import { sizeKey, withBrand } from "./utils";

const IST = 5.5 * 3600_000;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/** Midnight IST at the start of the day containing `t`. */
const istMidnight = (t: number) => Math.floor((t + IST) / 86_400_000) * 86_400_000 - IST;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const site = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://wondervastra.in").replace(/\/$/, "");
const ago = (t: number, now: number) => { const h = Math.round((now - t) / 3600_000); return h < 1 ? "just now" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`; };
const a = (text: string, url: string) => `<a href="${url}" style="color:${C.maroon};font-weight:600">${text}</a>`;

/** Wallet warning level: under ₹300 a few bookings will fail. */
export const WALLET_LOW = 30000;
/** A size with this many or fewer left is "almost gone" (amber) in the summary. */
const LOW = 2;

/** Four numbers across the top: what needs doing today. */
function tiles(t: { label: string; value: string; alert?: boolean }[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${t.map((x, i) => `<td width="${100 / t.length}%" valign="top" style="padding:0 ${i < t.length - 1 ? 6 : 0}px 0 0">
<div style="border:1px solid ${x.alert ? C.clay : C.line};background:${x.alert ? C.claySoft : C.sand};border-radius:3px;padding:10px 8px;text-align:center;font-family:${FONT}">
<div style="font-size:22px;font-weight:700;color:${x.alert ? C.clay : C.deep};line-height:1.1">${x.value}</div>
<div style="font-size:11px;color:${C.soft};margin-top:4px;line-height:1.25">${x.label}</div></div></td>`).join("")}</tr></table>`;
}

/** A section title with an optional count. */
const section = (t: string) => `<p style="margin:6px 0 0;padding-top:16px;border-top:1px solid ${C.line};font-family:Georgia,serif;font-size:19px;color:${C.deep}">${t}</p>`;

type StockRow = { productId: string; product: string; brand: string | null; threshold: number; size: string; piece: string; stock: number };
/**
 * Stock left for one listing, as a grid: sizes down the side, Top / Bottom across.
 * Red = sold out, amber = 1 or 2 left, plain = fine.
 */
function stockGrid(rows: StockRow[]) {
  const sizes = [...new Set(rows.map((r) => r.size))];
  const pieces = [...new Set(rows.map((r) => r.piece))];
  const cell = (r: StockRow | undefined) => {
    if (!r) return `<td align="center" style="padding:6px 4px;border-bottom:1px solid ${C.line};color:${C.faint};font-family:${FONT};font-size:13px">–</td>`;
    const out = r.stock <= 0, low = !out && r.stock <= LOW;
    const [bg, fg] = out ? [C.claySoft, C.clay] : low ? [C.amberSoft, C.amber] : ["#FFFFFF", C.ink];
    return `<td align="center" style="padding:6px 4px;border-bottom:1px solid ${C.line};background:${bg};color:${fg};font-family:${FONT};font-size:14px;font-weight:${out || low ? 700 : 500}">${out ? "Sold out" : r.stock}</td>`;
  };
  const first = rows[0];
  return `<div style="margin-top:12px">
<p style="margin:0 0 6px;font-family:${FONT};font-size:14px;font-weight:700;color:${C.ink}">${esc(withBrand(first.product, first.brand))}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-collapse:collapse">
<tr style="background:${C.sand}"><td style="padding:6px 8px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${C.soft}">Size</td>${pieces.map((p) => `<td align="center" style="padding:6px 4px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${C.soft}">${esc(p)}</td>`).join("")}</tr>
${sizes.map((s) => `<tr><td style="padding:6px 8px;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:13px;color:${C.ink};white-space:nowrap">${esc(sizeKey(s))}</td>${pieces.map((p) => cell(rows.find((r) => r.size === s && r.piece === p))).join("")}</tr>`).join("")}
</table></div>`;
}

export async function buildDailySummary(now = Date.now()) {
  const { orders, returnRequests, products, variants, brands, pageViews, siteEvents } = schema;
  const today = istMidnight(now), yesterday = today - 86_400_000;

  const [toPack, waiting, returns, stock, ySales, yVisits, yAdds, wallet] = await Promise.all([
    db.select({ id: orders.id, number: orders.number, name: orders.name, city: orders.city, total: orders.total, placedAt: orders.placedAt, createdAt: orders.createdAt })
      .from(orders).where(and(inArray(orders.status, ["confirmed", "packed"]), isNull(orders.awb))).orderBy(orders.createdAt),
    db.select({ id: orders.id, number: orders.number, name: orders.name, awb: orders.awb })
      .from(orders).where(and(inArray(orders.status, ["confirmed", "packed"]), isNotNull(orders.awb))).orderBy(orders.createdAt),
    db.select({ orderId: returnRequests.orderId, status: returnRequests.status, reason: returnRequests.reason, createdAt: returnRequests.createdAt, number: orders.number, name: orders.name })
      .from(returnRequests).innerJoin(orders, eq(orders.id, returnRequests.orderId)).where(inArray(returnRequests.status, ["requested", "received"])).orderBy(returnRequests.createdAt),
    db.select({ productId: products.id, product: products.name, brand: brands.name, threshold: products.lowStockThreshold, size: variants.option1, piece: variants.option2, stock: variants.stock })
      .from(variants).innerJoin(products, eq(products.id, variants.productId)).leftJoin(brands, eq(brands.id, products.brandId))
      .where(and(eq(products.status, "active"), eq(variants.active, true))).orderBy(asc(products.name), asc(variants.sortOrder)),
    db.select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(${orders.total}),0)` })
      .from(orders).where(and(gte(orders.placedAt, yesterday), lt(orders.placedAt, today), sql`${orders.status} not in ('pending_payment','cancelled')`)),
    db.select({ visitors: sql<number>`count(distinct ${pageViews.sessionId})`, views: sql<number>`count(*)` })
      .from(pageViews).where(and(gte(pageViews.createdAt, yesterday), lt(pageViews.createdAt, today))),
    db.select({ n: sql<number>`count(*)` }).from(siteEvents).where(and(eq(siteEvents.type, "add_to_cart"), gte(siteEvents.createdAt, yesterday), lt(siteEvents.createdAt, today))),
    walletConfigured() ? walletBalance({ fresh: true }) : Promise.resolve(null),
  ]);
  const topViewed = await db.select({ name: products.name, brand: brands.name, n: sql<number>`count(distinct ${pageViews.sessionId})` })
    .from(pageViews).innerJoin(products, eq(products.id, pageViews.productId)).leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(gte(pageViews.createdAt, yesterday), lt(pageViews.createdAt, today))).groupBy(products.id).orderBy(desc(sql`3`)).limit(3);

  const pcsRows = toPack.length ? await db.select({ id: schema.orderItems.orderId, n: sql<number>`sum(${schema.orderItems.qty})` }).from(schema.orderItems).where(inArray(schema.orderItems.orderId, toPack.map((o) => o.id))).groupBy(schema.orderItems.orderId) : [];
  const pcsOf = (id: string) => Number(pcsRows.find((r) => r.id === id)?.n ?? 0);
  const walletLow = Boolean(wallet && wallet.balance < WALLET_LOW);
  const out = stock.filter((v) => v.stock <= 0), low = stock.filter((v) => v.stock > 0 && v.stock <= LOW);
  const ys = ySales[0], yv = yVisits[0];
  const yOrders = Number(ys?.n ?? 0);

  const lines: string[] = [];
  lines.push(tiles([
    { label: "Orders to pack", value: String(toPack.length), alert: toPack.length > 0 },
    { label: "Waiting for pickup", value: String(waiting.length) },
    { label: "Returns to handle", value: String(returns.length), alert: returns.length > 0 },
    ...(wallet ? [{ label: "Delhivery wallet", value: money(wallet.balance).replace(/\.00$/, ""), alert: walletLow }] : []),
  ]));
  if (walletLow) lines.push(noteBlock(`<b>Delhivery wallet is low (${money(wallet!.balance)}).</b> Bookings fail when it runs out. Add money in ${a("Delhivery One", "https://one.delhivery.com/")} → Wallet. Each parcel costs about ₹40–60.`, "bad"));

  // To pack
  lines.push(section(toPack.length ? `Pack and ship today (${toPack.length})` : "Nothing to pack"));
  lines.push(toPack.length
    ? infoBlock(toPack.map((o) => [`${o.number} · ${ago(o.placedAt ?? o.createdAt, now)}`, `<b>${esc(o.name)}</b>, ${esc(o.city)} · ${pcsOf(o.id)} ${pcsOf(o.id) === 1 ? "piece" : "pieces"} · ${money(o.total)}<br>${a("Open and ship →", `${site()}/admin/orders/${o.id}#delhivery`)}`]))
    : `<span style="color:${C.soft}">No new orders waiting. All caught up.</span>`);

  if (waiting.length) {
    lines.push(section(`Booked, waiting for Delhivery (${waiting.length})`));
    lines.push(`Keep these labelled and ready for the courier: ${waiting.map((o) => `${a(esc(o.number), `${site()}/admin/orders/${o.id}`)} <span style="color:${C.soft}">(AWB ${esc(o.awb ?? "")})</span>`).join(", ")}.`);
  }

  if (returns.length) {
    lines.push(section(`Returns needing you (${returns.length})`));
    lines.push(infoBlock(returns.map((r) => [
      `${r.number} · ${r.status === "requested" ? `asked ${ago(r.createdAt, now)}` : "received back"}`,
      r.status === "requested"
        ? `<b>${esc(r.name)}</b>: “${esc(r.reason.slice(0, 90))}”<br>${a("Approve or reject →", `${site()}/admin/orders/${r.orderId}#return`)}`
        : `<b>${esc(r.name)}</b>: items are back. ${a("Send the refund →", `${site()}/admin/orders/${r.orderId}#return`)}`,
    ])));
  }

  // Stock
  lines.push(section("Stock left"));
  lines.push(out.length || low.length
    ? `${out.length ? `<b style="color:${C.clay}">${out.length} ${out.length === 1 ? "size is" : "sizes are"} sold out</b>` : "Nothing sold out"}${low.length ? ` · <b style="color:${C.amber}">${low.length} almost gone (1–2 left)</b>` : ""}. Restock in ${a("Products", `${site()}/admin/products`)}.`
    : "Every size is well stocked.");
  lines.push(`<span style="font-family:${FONT};font-size:12px;color:${C.soft}"><span style="display:inline-block;width:10px;height:10px;background:${C.claySoft};border:1px solid ${C.clay};vertical-align:middle"></span> Sold out &nbsp; <span style="display:inline-block;width:10px;height:10px;background:${C.amberSoft};border:1px solid ${C.amber};vertical-align:middle"></span> Only 1–2 left &nbsp; Numbers = pieces left</span>`);
  const byProduct = [...new Set(stock.map((v) => v.productId))].map((id) => stock.filter((v) => v.productId === id));
  // Listings with a problem first, then the rest.
  byProduct.sort((x, y) => Number(y.some((v) => v.stock <= 0)) - Number(x.some((v) => v.stock <= 0)) || Number(y.some((v) => v.stock <= LOW)) - Number(x.some((v) => v.stock <= LOW)));
  lines.push(`<div>${byProduct.map((rows) => stockGrid(rows as StockRow[])).join("")}</div>`);

  // Yesterday
  lines.push(section("Yesterday"));
  lines.push(tiles([
    { label: yOrders === 1 ? "order" : "orders", value: String(yOrders) },
    { label: "sales", value: money(Number(ys?.sum ?? 0)).replace(/\.00$/, "") },
    { label: "visitors", value: String(Number(yv?.visitors ?? 0)) },
    { label: "added to cart", value: String(Number(yAdds[0]?.n ?? 0)) },
  ]));
  if (topViewed.length) lines.push(`${label("Most viewed")}${topViewed.map((t, i) => `${i + 1}. ${esc(withBrand(t.name, t.brand))} <span style="color:${C.soft}">(${t.n} ${Number(t.n) === 1 ? "visitor" : "visitors"})</span>`).join("<br>")}`);
  lines.push(`<span style="font-size:13px;color:${C.soft}">More in ${a("Visitors", `${site()}/admin/analytics`)}.</span>`);

  const todo = [walletLow && "wallet low", toPack.length && `${toPack.length} to pack`, waiting.length && `${waiting.length} awaiting pickup`, returns.length && `${returns.length} ${returns.length === 1 ? "return" : "returns"}`, out.length && `${out.length} sold out`].filter(Boolean) as string[];
  const date = new Date(now + IST).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const subject = `${date}: ${todo.length ? todo.join(", ") : "nothing waiting"} · yesterday ${yOrders} ${yOrders === 1 ? "order" : "orders"}`;
  return { subject, lines, preheader: todo.length ? `Today: ${todo.join(", ")}.` : "All caught up.", counts: { toPack: toPack.length, waiting: waiting.length, returns: returns.length, walletLow } };
}

export function dailySummaryHtml(m: { lines: string[]; preheader: string }, now = Date.now()) {
  const hour = new Date(now + IST).getUTCHours();
  return renderEmail({
    eyebrow: "Store alert · Daily summary",
    preheader: m.preheader,
    heading: hour < 12 ? "Good morning. Here's today." : "Here's your store today.",
    lines: m.lines,
    cta: { label: "Open orders", url: `${site()}/admin/orders` },
  }, "Your daily store summary. Turn it off in Admin → Settings.", { audience: "admin" });
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
  await dispatch({ event: "admin_daily_summary", email: { to: s.adminAlertEmail, subject: m.subject, html: dailySummaryHtml(m, now) } });
  return { sent: true, ...m.counts };
}
