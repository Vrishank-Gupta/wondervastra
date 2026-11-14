import { and, desc, eq, gte, inArray, lte, SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

export async function GET(req: Request) {
  const a = await getAdmin();
  if (!a) return new Response("Unauthorized", { status: 401 });
  const u = new URL(req.url).searchParams;
  const conds: SQL[] = [];
  const status = u.get("status");
  if (status && status !== "all") conds.push(eq(schema.orders.status, status as typeof schema.orders.$inferSelect.status));
  if (u.get("from")) conds.push(gte(schema.orders.createdAt, new Date(u.get("from")!).getTime()));
  if (u.get("to")) conds.push(lte(schema.orders.createdAt, new Date(u.get("to")!).getTime() + 86_400_000));
  const orders = await db.select().from(schema.orders).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.orders.createdAt)).limit(10000);
  const items = orders.length ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orders.map((o) => o.id))) : [];
  const r = (p: number) => (p / 100).toFixed(2);
  const rows: (string | number | null)[][] = [[
    "Order", "Date", "Status", "Payment", "Payment status", "Customer", "Phone", "Email", "Address", "City", "State", "Pincode",
    "Items", "Subtotal", "Offer discount", "Coupon", "Coupon discount", "Delivery", "COD fee", "Total", "Refunded", "Courier", "AWB", "Tracking link", "Source", "Campaign", "Razorpay payment ID",
  ]];
  for (const o of orders) {
    rows.push([
      o.number, new Date(o.createdAt).toISOString(), o.status, o.paymentMethod, o.paymentStatus, o.name, o.phone, o.email, [o.line1, o.line2].filter(Boolean).join(", "), o.city, o.state, o.pincode,
      items.filter((i) => i.orderId === o.id).map((i) => `${i.name} [${i.variantLabel}] x${i.qty}`).join(" | "),
      r(o.subtotal), r(o.offerDiscount), o.couponCode, r(o.couponDiscount), r(o.shippingTotal), r(o.codFee), r(o.total), r(o.refundedTotal), o.courier, o.awb, o.trackingUrl, o.utmSource, o.utmCampaign, o.razorpayPaymentId,
    ]);
  }
  await audit(a, "export", "orders", null, `Exported ${orders.length} orders to CSV`);
  return new Response(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="wondervastra-orders-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
