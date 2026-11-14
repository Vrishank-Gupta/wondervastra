import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, getCustomer, peekLimit, rateLimit } from "@/lib/auth";
import { quoteCart } from "@/lib/cart";
import { normalizeEmail, normalizePhone } from "@/lib/utils";

const Body = z.object({
  items: z.array(z.object({ variantId: z.string().max(40), qty: z.number().int().min(0).max(999) })).max(50),
  couponCode: z.string().max(40).optional().nullable(),
  paymentMethod: z.enum(["razorpay", "cod"]).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cart" }, { status: 400 });
  const { items, couponCode, paymentMethod, email, phone } = parsed.data;
  const customer = await getCustomer();
  // Wrong coupon codes are limited per visitor, so codes can't be found by guessing.
  const failKey = `coupon-fail:${await clientIp()}`;
  const blocked = Boolean(couponCode) && !(await peekLimit(failKey, 15, 15 * 60_000));
  const quote = await quoteCart(items, {
    couponCode: blocked ? null : couponCode, paymentMethod,
    who: { customerId: customer?.id, email: normalizeEmail(email) ?? customer?.email, phone: normalizePhone(phone) ?? customer?.phone },
  });
  if (blocked) return NextResponse.json({ ...quote, couponError: "Too many coupon attempts. Please try again in 15 minutes." });
  if (couponCode && quote.couponError === "That coupon code isn't valid.") await rateLimit(failKey, 15, 15 * 60_000);
  return NextResponse.json(quote);
}
