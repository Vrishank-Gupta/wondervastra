import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCustomer } from "@/lib/auth";

export async function POST(req: Request) {
  const c = await getCustomer();
  if (!c) return NextResponse.json({ error: "Log in" }, { status: 401 });
  const { productId, on } = await req.json();
  if (typeof productId !== "string") return NextResponse.json({ error: "Invalid" }, { status: 400 });
  if (on) await db.insert(schema.wishlist).values({ customerId: c.id, productId }).onConflictDoNothing();
  else await db.delete(schema.wishlist).where(and(eq(schema.wishlist.customerId, c.id), eq(schema.wishlist.productId, productId)));
  return NextResponse.json({ ok: true });
}
