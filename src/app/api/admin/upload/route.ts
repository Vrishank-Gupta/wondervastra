import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, saveImage } from "@/lib/storage";

export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files received." }, { status: 400 });
  const urls: string[] = [];
  for (const f of files.slice(0, 15)) {
    if (f.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `${f.name} is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Try a smaller photo.` }, { status: 413 });
    try {
      urls.push(await saveImage(Buffer.from(await f.arrayBuffer())));
    } catch (e) {
      console.error("upload failed", e);
      return NextResponse.json({ error: `${f.name} couldn't be read as an image. Use JPG, PNG or WebP.` }, { status: 400 });
    }
  }
  return NextResponse.json({ urls });
}
