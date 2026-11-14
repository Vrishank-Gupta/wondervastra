import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { clientIp, rateLimit } from "@/lib/auth";
import { newId, normalizeEmail, normalizePhone } from "@/lib/utils";

const Body = z.object({ productId: z.string().max(40), variantId: z.string().max(40).optional().nullable(), contact: z.string().max(200) });

export async function POST(req: Request) {
  const ip = await clientIp();
  if (!(await rateLimit(`alert:${ip}`, 20, 15 * 60_000))) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { productId, variantId, contact } = parsed.data;
  const email = normalizeEmail(contact);
  const phone = email ? null : normalizePhone(contact);
  if (!email && !phone) return NextResponse.json({ error: "Enter a valid email or 10-digit mobile number." }, { status: 400 });
  const [p] = await db.select({ id: schema.products.id }).from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.status, "active")));
  if (!p) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (!(await rateLimit(`alert-contact:${email ?? phone}`, 10, 24 * 60 * 60_000))) return NextResponse.json({ error: "You've signed up for a lot of alerts today. Try again tomorrow." }, { status: 429 });
  const existing = await db.select().from(schema.stockAlerts).where(and(
    eq(schema.stockAlerts.productId, productId), eq(schema.stockAlerts.status, "waiting"),
    email ? eq(schema.stockAlerts.email, email) : eq(schema.stockAlerts.phone, phone!),
  ));
  if (!existing.some((a) => (a.variantId ?? null) === (variantId ?? null))) {
    await db.insert(schema.stockAlerts).values({ id: newId(), productId, variantId: variantId ?? null, email, phone });
  }
  return NextResponse.json({ ok: true });
}
