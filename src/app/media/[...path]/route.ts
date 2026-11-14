import { readFile } from "node:fs/promises";
import path from "node:path";
import { uploadDir } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const name = path.basename(parts.join("/")); // Blocks path traversal: only flat filenames exist.
  if (!/^[\w-]+\.jpg$/.test(name)) return new Response("Not found", { status: 404 });
  try {
    const file = await readFile(path.join(uploadDir(), name));
    return new Response(new Uint8Array(file), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
