import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { clientIp, rateLimit } from "@/lib/auth";
import { deliversTo } from "@/lib/delivery-area";
import { getSettings } from "@/lib/settings";
import { newId, normalizeEmail, normalizePhone } from "@/lib/utils";

const Body = z.object({ pincode: z.string().regex(/^[1-9]\d{5}$/), contact: z.string().max(200), place: z.string().max(80).optional().nullable() });

/** A buyer outside the delivery area asks to be told when we reach their pincode. */
export async function POST(req: Request) {
  const ip = await clientIp();
  if (!(await rateLimit(`area:${ip}`, 10, 15 * 60_000))) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid 6-digit pincode." }, { status: 400 });
  const { pincode, contact, place } = parsed.data;
  const email = normalizeEmail(contact);
  const phone = email ? null : normalizePhone(contact);
  if (!email && !phone) return NextResponse.json({ error: "Enter a valid email or 10-digit mobile number." }, { status: 400 });
  if (deliversTo(pincode, (await getSettings()).deliveryPincodes)) return NextResponse.json({ ok: true, serviceable: true });
  const [dupe] = await db.select({ id: schema.areaRequests.id }).from(schema.areaRequests)
    .where(and(eq(schema.areaRequests.pincode, pincode), email ? eq(schema.areaRequests.email, email) : eq(schema.areaRequests.phone, phone!)));
  if (!dupe) await db.insert(schema.areaRequests).values({ id: newId(), pincode, place: place?.trim() || null, email, phone });
  return NextResponse.json({ ok: true });
}
