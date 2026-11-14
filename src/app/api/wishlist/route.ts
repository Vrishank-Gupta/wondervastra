import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCustomer } from "@/lib/auth";

export async function POST(req: Request) {
  const c = await getCustomer();
  if (!c) return NextResponse.json({ error: "Log in" }, { status: 401 });
  const { productId, on } = await req.json().catch(() => ({}));
  if (typeof productId !== "string" || productId.length > 40) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  if (on) {
    const [p] = await db.select({ id: schema.products.id }).from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.status, "active")));
    if (!p) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  if (on) await db.insert(schema.wishlist).values({ customerId: c.id, productId }).onConflictDoNothing();
  else await db.delete(schema.wishlist).where(and(eq(schema.wishlist.customerId, c.id), eq(schema.wishlist.productId, productId)));
  return NextResponse.json({ ok: true });
}
