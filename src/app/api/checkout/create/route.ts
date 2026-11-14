import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { clientIp, getCustomer, rateLimit } from "@/lib/auth";
import { CheckoutError, createOrder, expireUnpaidOrders } from "@/lib/orders";
import { createRazorpayOrder, onlinePaymentsAvailable, razorpayConfigured, razorpayKeyId, simulationAllowed } from "@/lib/razorpay";
import { newId, normalizeEmail, normalizePhone } from "@/lib/utils";
import { PREVIEW_MESSAGE, previewMode } from "@/lib/preview";

const Body = z.object({
  items: z.array(z.object({ variantId: z.string().max(40), qty: z.number().int().min(1).max(999) })).min(1).max(50),
  couponCode: z.string().max(40).nullable().optional(),
  paymentMethod: z.enum(["razorpay", "cod"]),
  expectedTotal: z.number().int().optional(),
  name: z.string().trim().min(2).max(100),
  email: z.string().max(200),
  phone: z.string().max(20),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().regex(/^[1-9]\d{5}$/),
  customerNote: z.string().trim().max(300).optional().nullable(),
  whatsappOptIn: z.boolean(),
  saveAddress: z.boolean().optional(),
  utmSource: z.string().max(40).optional().nullable(),
  utmCampaign: z.string().max(60).optional().nullable(),
});

export async function POST(req: Request) {
  if (previewMode()) return NextResponse.json({ error: PREVIEW_MESSAGE }, { status: 503 });
  const ip = await clientIp();
  if (!(await rateLimit(`checkout:${ip}`, 30, 15 * 60_000))) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  const b = parsed.data;
  const email = normalizeEmail(b.email);
  const phone = normalizePhone(b.phone);
  if (!email) return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Please enter a valid 10-digit mobile number." }, { status: 400 });
  if (b.paymentMethod === "razorpay" && !onlinePaymentsAvailable()) {
    return NextResponse.json({ error: "Online payment isn't available right now." }, { status: 400 });
  }

  await expireUnpaidOrders(); // Frees stock from abandoned checkouts before we check availability.
  const customer = await getCustomer();

  try {
    const order = await createOrder({ ...b, email, phone, customerId: customer?.id ?? null });

    if (customer) {
      if (!customer.name) await db.update(schema.customers).set({ name: b.name }).where(eq(schema.customers.id, customer.id));
      if (b.saveAddress) {
        const existing = await db.select().from(schema.addresses).where(eq(schema.addresses.customerId, customer.id));
        if (!existing.some((a) => a.line1 === b.line1 && a.pincode === b.pincode)) {
          await db.insert(schema.addresses).values({
            id: newId(), customerId: customer.id, name: b.name, phone, line1: b.line1, line2: b.line2 ?? null,
            city: b.city, state: b.state, pincode: b.pincode, isDefault: existing.length === 0,
          });
        }
      }
    }

    if (b.paymentMethod === "cod") return NextResponse.json(order);
    if (simulationAllowed()) return NextResponse.json({ ...order, simulated: true });
    if (!razorpayConfigured()) throw new CheckoutError("Online payment isn't available right now.");

    try {
      const rp = await createRazorpayOrder(order.total, order.number, { order_id: order.id, order_number: order.number });
      await db.update(schema.orders).set({ razorpayOrderId: rp.id }).where(eq(schema.orders.id, order.id));
      return NextResponse.json({ ...order, razorpayOrderId: rp.id, keyId: razorpayKeyId() });
    } catch (e) {
      console.error("Razorpay order failed", e);
      const { changeOrderStatus } = await import("@/lib/orders");
      await changeOrderStatus(order.id, "cancelled", { actor: "system", note: "payment gateway error", silent: true });
      return NextResponse.json({ error: "Our payment partner is having trouble. Please try again in a moment." }, { status: 502 });
    }
  } catch (e) {
    if (e instanceof CheckoutError) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("Checkout failed", e);
    return NextResponse.json({ error: "Something went wrong. You haven't been charged. Please try again." }, { status: 500 });
  }
}
