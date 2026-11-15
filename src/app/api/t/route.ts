import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * First-party analytics beacon. Records page views (with time on page and scroll depth) and shopping events.
 * No names, emails or phone numbers; admins and bots are left out.
 */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|pingdom|monitor/i;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
const ID = /^[A-Za-z0-9_-]{8,40}$/;
const hits = new Map<string, { n: number; at: number }>();
function allow(sid: string) {
  const now = Date.now();
  const h = hits.get(sid);
  if (!h || now - h.at > 10 * 60_000) { hits.set(sid, { n: 1, at: now }); if (hits.size > 5000) hits.clear(); return true; }
  return ++h.n <= 400;
}

function source(utm: string | null, ref: string | null, host: string) {
  if (utm) return utm.toLowerCase().slice(0, 40);
  if (!ref) return "direct";
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "").replace(/^(l|m|lm)\./, "");
    if (h === host.replace(/^www\./, "")) return null; // internal navigation
    if (/instagram/.test(h)) return "instagram";
    if (/whatsapp|wa\.me/.test(h)) return "whatsapp";
    if (/facebook|fb\./.test(h)) return "facebook";
    if (/google\./.test(h)) return "google";
    if (/bing\./.test(h)) return "bing";
    if (/youtube/.test(h)) return "youtube";
    return h.slice(0, 40);
  } catch { return "direct"; }
}

export async function POST(req: Request) {
  try { return await handle(req); } catch (e) { console.error("analytics beacon", e); return new NextResponse(null, { status: 204 }); }
}
async function handle(req: Request) {
  const ua = req.headers.get("user-agent") ?? "";
  if (BOT.test(ua) || /(^|;\s*)vv_admin=/.test(req.headers.get("cookie") ?? "")) return new NextResponse(null, { status: 204 });
  let b: Record<string, unknown>;
  try { const text = await req.text(); if (text.length > 4000) throw new Error("big"); b = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
  const sid = str(b.s, 40), id = str(b.id, 40);
  if (!sid || !ID.test(sid)) return new NextResponse(null, { status: 400 });
  // Per visitor, not per connection (many shoppers share one mobile-network address). Kept in memory:
  // a database write per beacon would double the cost of every click.
  if (!allow(sid)) return new NextResponse(null, { status: 204 });
  const path = str(b.path, 300);
  const productId = str(b.pid, 40);
  if (b.k === "pv" && id && ID.test(id) && path) {
    const host = new URL(req.url).hostname;
    const src = source(str(b.utm, 60), str(b.ref, 300), host);
    const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "phone" : "desktop";
    const city = req.headers.get("cf-ipcity") || req.headers.get("cf-ipcountry") || null;
    const view = { path, productId, referrer: str(b.ref, 300), source: src, device, city };
    // The "left the page" beacon may have arrived first and created the row: fill in the rest.
    await db.insert(schema.pageViews).values({ id, sessionId: sid, ...view }).onConflictDoUpdate({ target: schema.pageViews.id, set: view });
  } else if (b.k === "end" && id && ID.test(id)) {
    const dur = Math.max(0, Math.min(30 * 60_000, Math.round(Number(b.dur) || 0)));
    const scroll = Math.max(0, Math.min(100, Math.round(Number(b.scroll) || 0)));
    // Works whichever beacon arrives first.
    await db.insert(schema.pageViews).values({ id, sessionId: sid, path: path ?? "", productId, durationMs: dur, scrollPct: scroll })
      .onConflictDoUpdate({
        target: schema.pageViews.id,
        // Keep the longest time and deepest scroll: beacons can arrive out of order.
        set: { durationMs: sql`max(${schema.pageViews.durationMs}, ${dur})`, scrollPct: sql`max(${schema.pageViews.scrollPct}, ${scroll})` },
        where: eq(schema.pageViews.sessionId, sid),
      });
  } else if (b.k === "ev") {
    const type = str(b.type, 30);
    if (!type || !/^[a-z_]+$/.test(type)) return new NextResponse(null, { status: 400 });
    await db.insert(schema.siteEvents).values({ id: crypto.randomUUID(), sessionId: sid, type, path, label: str(b.label, 80), productId });
  }
  return new NextResponse(null, { status: 204 });
}
