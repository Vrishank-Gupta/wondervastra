/**
 * Delhivery One (Delhivery's B2C API): delivery estimates, shipping cost, booking shipments, labels,
 * pickups, cancellations and tracking. The API token is a server secret and never reaches the browser.
 */
import type { OrderStatus } from "@/db/schema";

const base = () => (process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com").replace(/\/$/, "");
export function delhiveryConfigured() {
  return Boolean(process.env.DELHIVERY_TOKEN);
}

async function call(path: string, init: RequestInit & { form?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { Authorization: `Token ${process.env.DELHIVERY_TOKEN}`, Accept: "application/json" };
  let body = init.body;
  if (init.form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(init.form).toString(); }
  else if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base()}${path}`, { ...init, body, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok || json == null) throw new Error(`Delhivery didn't respond properly (${res.status}). Please try again in a minute.`);
  return json as Record<string, unknown> & unknown[];
}

/* ---------- Serviceability and estimates ---------- */

export type PinInfo = { serviceable: boolean; prepaid: boolean; cod: boolean; remote: boolean; district: string | null; state: string | null };
export async function pincodeInfo(pin: string): Promise<PinInfo | null> {
  const json = await call(`/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pin)}`);
  const pc = (json as unknown as { delivery_codes?: { postal_code: Record<string, string> }[] }).delivery_codes?.[0]?.postal_code;
  if (!pc) return { serviceable: false, prepaid: false, cod: false, remote: false, district: null, state: null };
  return { serviceable: pc.pre_paid === "Y" || pc.cod === "Y", prepaid: pc.pre_paid === "Y", cod: pc.cod === "Y", remote: pc.is_oda === "Y", district: pc.district || null, state: pc.state_code || null };
}

const tatCache = new Map<string, { at: number; days: number | null }>();
/** Days in transit from the pickup pincode, by surface. Cached for 12 hours per route. */
export async function transitDays(fromPin: string, toPin: string): Promise<number | null> {
  const key = `${fromPin}-${toPin}`;
  const hit = tatCache.get(key);
  if (hit && Date.now() - hit.at < 12 * 3600_000) return hit.days;
  let days: number | null = null;
  try {
    const json = await call(`/api/dc/expected_tat?origin_pin=${fromPin}&destination_pin=${toPin}&mot=S&pdt=B2C`) as unknown as { success?: boolean; data?: { tat?: number } };
    if (json.success && typeof json.data?.tat === "number") days = Math.max(0, Math.round(json.data.tat));
  } catch { days = null; }
  tatCache.set(key, { at: Date.now(), days });
  return days;
}

/** What Delhivery will charge us, GST included, in paise. */
export async function shippingCost(fromPin: string, toPin: string, grams: number, cod: boolean): Promise<number | null> {
  const json = await call(`/api/kinko/v1/invoice/charges/.json?md=S&ss=Delivered&d_pin=${toPin}&o_pin=${fromPin}&cgm=${Math.max(1, Math.round(grams))}&pt=${cod ? "COD" : "Pre-paid"}`);
  const row = (json as unknown as { total_amount?: number }[])[0];
  return typeof row?.total_amount === "number" ? Math.round(row.total_amount * 100) : null;
}

/**
 * The date a buyer can expect the parcel: dispatch takes `dispatchDays` working days (Mon–Sat), then
 * Delhivery's transit days. Sundays aren't counted for dispatch.
 */
export function etaDate(now: Date, dispatchDays: number, transit: number) {
  const d = new Date(now);
  let left = dispatchDays;
  while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) left--; }
  d.setDate(d.getDate() + transit);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // No Sunday deliveries promised.
  return d;
}

/* ---------- Shipments ---------- */

export type ShipmentInput = {
  orderNumber: string; name: string; phone: string; address: string; city: string; state: string; pincode: string;
  cod: boolean; total: number; products: string; quantity: number; grams: number; box: { l: number; w: number; h: number };
  pickupName: string; seller: { name: string; address: string; gstin: string }; hsn: string | null;
};
export async function createShipment(s: ShipmentInput): Promise<string> {
  const shipment = {
    name: s.name, add: s.address, pin: s.pincode, city: s.city, state: s.state, country: "India", phone: s.phone.replace(/\D/g, "").slice(-10),
    order: s.orderNumber, payment_mode: s.cod ? "COD" : "Prepaid", cod_amount: s.cod ? (s.total / 100).toFixed(2) : "0", total_amount: (s.total / 100).toFixed(2),
    products_desc: s.products.slice(0, 200), quantity: String(s.quantity), weight: String(Math.round(s.grams)),
    shipment_length: String(s.box.l), shipment_width: String(s.box.w), shipment_height: String(s.box.h),
    shipping_mode: "Surface", address_type: "home",
    seller_name: s.seller.name, seller_add: s.seller.address, seller_gst_tin: s.seller.gstin, hsn_code: s.hsn ?? "",
  };
  const json = await call("/api/cmu/create.json", { method: "POST", form: { format: "json", data: JSON.stringify({ shipments: [shipment], pickup_location: { name: s.pickupName } }) } }) as unknown as {
    success?: boolean; rmk?: string; packages?: { waybill?: string; status?: string; remarks?: string[] | string }[];
  };
  const pkg = json.packages?.[0];
  if (pkg?.waybill && pkg.status !== "Fail") return pkg.waybill;
  const why = [pkg?.remarks, json.rmk].flat().filter(Boolean).join(" ");
  throw new Error(`Delhivery didn't book this shipment${why ? `: ${why}` : "."}`);
}

/** A link to the printable shipping label (PDF). */
export async function labelLink(awb: string): Promise<string> {
  const json = await call(`/api/p/packing_slip?wbns=${encodeURIComponent(awb)}&pdf=true`) as unknown as { packages?: { pdf_download_link?: string }[] };
  const link = json.packages?.[0]?.pdf_download_link;
  if (!link) throw new Error("Delhivery hasn't made the label yet. Try again in a minute.");
  return link;
}

export async function cancelShipment(awb: string) {
  const json = await call("/api/p/edit", { method: "POST", body: JSON.stringify({ waybill: awb, cancellation: "true" }) }) as unknown as { status?: boolean; remark?: string; error?: string };
  if (json.status === false) throw new Error(`Delhivery couldn't cancel this shipment${json.remark || json.error ? `: ${json.remark || json.error}` : "."}`);
}

export async function requestPickup(pickupName: string, date: string, time: string, count: number) {
  const json = await call("/fm/request/new/", { method: "POST", body: JSON.stringify({ pickup_location: pickupName, pickup_date: date, pickup_time: `${time}:00`, expected_package_count: count }) }) as unknown as { pickup_id?: number | string; error?: unknown; pr_exist?: boolean; data?: { message?: string } };
  if (json.pickup_id) return String(json.pickup_id);
  if (json.pr_exist) throw new Error("A pickup is already booked for that date. Delhivery will collect all parcels in one visit.");
  throw new Error(`Delhivery didn't book the pickup${typeof json.error === "string" ? `: ${json.error}` : json.data?.message ? `: ${json.data.message}` : "."}`);
}

/* ---------- Tracking ---------- */

export type Tracking = { awb: string; status: string; type: string; at: number | null; where: string | null; note: string | null; expected: number | null };
export async function track(awbs: string[]): Promise<Tracking[]> {
  if (!awbs.length) return [];
  const json = await call(`/api/v1/packages/json/?waybill=${awbs.map(encodeURIComponent).join(",")}`) as unknown as { ShipmentData?: { Shipment: Record<string, unknown> }[] };
  const when = (v: unknown) => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
  return (json.ShipmentData ?? []).map(({ Shipment: s }) => {
    const st = (s.Status ?? {}) as Record<string, string>;
    return {
      awb: String(s.AWB ?? ""), status: st.Status ?? "", type: st.StatusType ?? "", at: when(st.StatusDateTime), where: st.StatusLocation || null,
      note: st.Instructions || null, expected: when(s.ExpectedDeliveryDate) ?? when(s.PromisedDeliveryDate),
    };
  });
}

/**
 * Where a Delhivery status should move an order. Only forward moves: a parcel being picked up ships the order,
 * "Dispatched" means out for delivery, "Delivered" delivers it. Returns (RTO) are flagged for the seller, not automated.
 */
export function orderStatusFor(t: Pick<Tracking, "status" | "type">, current: OrderStatus): OrderStatus | null {
  const s = t.status.toLowerCase(), type = t.type.toUpperCase();
  if (type === "RT" || type === "CN" || s.includes("rto") || s.includes("cancel")) return null;
  if (type === "DL" && s === "delivered") return current === "delivered" ? null : "delivered";
  if (s === "dispatched") return ["confirmed", "packed", "shipped"].includes(current) ? "out_for_delivery" : null;
  if (["in transit", "pending", "picked up"].includes(s)) return ["confirmed", "packed"].includes(current) ? "shipped" : null;
  return null;
}
export function trackingLink(awb: string) {
  return `https://www.delhivery.com/track-v2/package/${encodeURIComponent(awb)}`;
}
