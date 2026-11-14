import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { markPaid } from "@/lib/orders";
import { simulationAllowed, verifyPaymentSignature } from "@/lib/razorpay";

const Body = z.object({
  orderId: z.string().max(40),
  simulate: z.boolean().optional(),
  razorpay_order_id: z.string().optional(),
  razorpay_payment_id: z.string().optional(),
  razorpay_signature: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const b = parsed.data;

  if (b.simulate) {
    if (!simulationAllowed()) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    await markPaid(b.orderId, `sim_${Date.now()}`, "simulated payment");
    return NextResponse.json({ ok: true });
  }
  if (!b.razorpay_order_id || !b.razorpay_payment_id || !b.razorpay_signature) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }
  // The signature proves Razorpay issued this payment for this Razorpay order, and the
  // lookup binds that Razorpay order to our order, so amounts can't be swapped.
  if (!verifyPaymentSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature)) {
    return NextResponse.json({ error: "Payment could not be verified" }, { status: 400 });
  }
  const [o] = await db.select().from(schema.orders)
    .where(and(eq(schema.orders.id, b.orderId), eq(schema.orders.razorpayOrderId, b.razorpay_order_id)));
  if (!o) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  await markPaid(o.id, b.razorpay_payment_id, "razorpay checkout");
  return NextResponse.json({ ok: true });
}
