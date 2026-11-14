import { readFile } from "node:fs/promises";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { cloudinaryShareImage, uploadDir } from "@/lib/storage";

/** 1200x630 JPEG for WhatsApp and Instagram link previews, with a blurred fill behind the product. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [img] = await db.select().from(schema.productImages).where(eq(schema.productImages.productId, id)).orderBy(asc(schema.productImages.sortOrder)).limit(1);
  if (!img) return new Response("Not found", { status: 404 });
  // Production: Cloudinary renders the share image, so the server needs no image library.
  const hosted = cloudinaryShareImage(img.url);
  if (hosted) return Response.redirect(hosted, 302);
  if (process.env.CF_BUILD === "1") return Response.redirect(new URL(img.url, _.url).toString(), 302);
  const { default: sharp } = await import("sharp");
  let input: Buffer;
  if (img.url.startsWith("http")) input = Buffer.from(await (await fetch(img.url, { signal: AbortSignal.timeout(8000) })).arrayBuffer());
  else if (img.url.startsWith("/media/")) input = await readFile(path.join(uploadDir(), path.basename(img.url)));
  else input = await readFile(path.join(process.cwd(), "public", path.normalize(img.url)));
  const bg = await sharp(input).resize(1200, 630, { fit: "cover" }).blur(30).toBuffer();
  const fg = await sharp(input).resize(560, 630, { fit: "inside" }).toBuffer();
  const out = await sharp(bg).composite([{ input: fg, gravity: "center" }]).jpeg({ quality: 82 }).toBuffer();
  return new Response(new Uint8Array(out), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
}
