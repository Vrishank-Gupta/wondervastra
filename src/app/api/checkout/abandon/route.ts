import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { changeOrderStatus } from "@/lib/orders";

/** Buyer closed the Razorpay window: release their stock hold right away. */
export async function POST(req: Request) {
  const { accessToken } = await req.json().catch(() => ({ accessToken: null }));
  if (typeof accessToken !== "string") return NextResponse.json({ ok: false }, { status: 400 });
  const [o] = await db.select().from(schema.orders)
    .where(and(eq(schema.orders.accessToken, accessToken), eq(schema.orders.status, "pending_payment")));
  if (o) await changeOrderStatus(o.id, "cancelled", { actor: "system", note: "payment window closed", silent: true }).catch(() => {});
  return NextResponse.json({ ok: true });
}
