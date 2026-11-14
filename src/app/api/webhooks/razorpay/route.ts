import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { addEvent, markPaid, markPaymentFailed } from "@/lib/orders";
import { verifyWebhookSignature } from "@/lib/razorpay";

/**
 * Razorpay's server-to-server confirmation. This keeps orders right when a buyer's phone
 * dies or Instagram's in-app browser closes straight after paying. Handlers are idempotent.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, sig)) return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  const body = JSON.parse(raw);
  const event: string = body.event;
  const payment = body.payload?.payment?.entity;
  const refund = body.payload?.refund?.entity;

  if (payment?.order_id && (event === "payment.captured" || event === "order.paid")) {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.razorpayOrderId, payment.order_id));
    if (o) {
      if (payment.amount !== o.total) {
        await addEvent(db, o.id, "attention", `⚠ Paid amount ${payment.amount} doesn't match order total ${o.total}. Check before shipping.`);
      }
      await markPaid(o.id, payment.id, "razorpay webhook");
    }
  } else if (payment?.order_id && event === "payment.failed") {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.razorpayOrderId, payment.order_id));
    if (o) await markPaymentFailed(o.id, payment.error_description ?? "declined");
  } else if (event === "refund.processed" && refund?.payment_id) {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.razorpayPaymentId, refund.payment_id));
    if (o) await addEvent(db, o.id, "refund", `Razorpay confirmed refund ${refund.id} of ₹${refund.amount / 100}`);
  }
  return NextResponse.json({ ok: true });
}
