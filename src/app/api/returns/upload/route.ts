import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { rateLimit } from "@/lib/auth";
import { returnWindow } from "@/lib/order-access";
import { MAX_UPLOAD_BYTES, saveImage } from "@/lib/storage";

/** Photos for a return request. Only for an order whose return window is open, found by its private order link. */
export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const [o] = token ? await db.select().from(schema.orders).where(eq(schema.orders.accessToken, token)) : [];
  if (!o) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const win = await returnWindow(o);
  if (!win.open) return NextResponse.json({ error: "The return window for this order has closed." }, { status: 400 });
  if (!(await rateLimit(`return-photo:${o.id}`, 20, 60 * 60_000))) return NextResponse.json({ error: "Too many photos. Please try again later." }, { status: 429 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File).slice(0, 5);
  if (!files.length) return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
  const urls: string[] = [];
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `${f.name} is too big. Try a photo under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` }, { status: 413 });
    try { urls.push(await saveImage(Buffer.from(await f.arrayBuffer()))); }
    catch { return NextResponse.json({ error: `${f.name} couldn't be read as a photo. Use JPG, PNG or WebP.` }, { status: 400 }); }
  }
  return NextResponse.json({ urls });
}
