import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { newId } from "./utils";

export function uploadDir() {
  // Runtime data, not source: keep the build from tracing the whole project.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR || "./data/uploads");
}
function cloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

/**
 * Decoding with sharp is the validation: anything that isn't a real raster image
 * throws. Re-encoding strips EXIF (including phone GPS data) and neutralises payloads.
 * JPEG is used because WhatsApp and Instagram link previews handle it reliably.
 */
export async function saveImage(input: Buffer): Promise<string> {
  const meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  if (!meta.format || !["jpeg", "png", "webp", "avif", "heif"].includes(meta.format)) {
    throw new Error("Please upload a JPG, PNG, WebP or HEIC image.");
  }
  const output = await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();

  if (cloudinaryConfigured()) return uploadToCloudinary(output);

  const name = `${newId()}.jpg`;
  await fs.mkdir(uploadDir(), { recursive: true });
  await fs.writeFile(path.join(uploadDir(), name), output);
  return `/media/${name}`;
}

async function uploadToCloudinary(image: Buffer) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "vastravibe";
  const signature = createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`)
    .digest("hex");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(image)], { type: "image/jpeg" }));
  form.append("api_key", process.env.CLOUDINARY_API_KEY!);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Image upload failed");
  return json.secure_url as string;
}
