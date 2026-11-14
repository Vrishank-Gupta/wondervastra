import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { newId } from "./utils";

export function uploadDir() {
  // Runtime data, not source: keep the build from tracing the whole project.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR || "./data/uploads");
}
export function cloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

/** Cloudinary's free plan rejects images over 10 MB; the local disk path accepts up to 12 MB. */
export const MAX_UPLOAD_BYTES = cloudinaryConfigured() ? 10 * 1024 * 1024 : 12 * 1024 * 1024;

/**
 * Production (Cloudinary): the original goes up with an incoming transformation, so Cloudinary decodes it
 * (rejecting anything that isn't a real image), resizes it, re-encodes it as JPEG and drops EXIF such as
 * phone GPS data. Nothing native runs on our server, which is what lets the store run on Cloudflare Workers.
 *
 * Local development (disk): sharp does the same job. It's imported lazily so the Cloudflare build never loads it.
 */
export async function saveImage(input: Buffer): Promise<string> {
  if (cloudinaryConfigured()) {
    if (!looksLikeImage(input)) throw new Error("Please upload a JPG, PNG, WebP or HEIC image.");
    return uploadToCloudinary(input);
  }
  const { default: sharp } = await import("sharp");
  const meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  if (!meta.format || !["jpeg", "png", "webp", "avif", "heif"].includes(meta.format)) {
    throw new Error("Please upload a JPG, PNG, WebP or HEIC image.");
  }
  // JPEG because WhatsApp and Instagram link previews handle it reliably.
  const output = await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  const name = `${newId()}.jpg`;
  await fs.mkdir(uploadDir(), { recursive: true });
  await fs.writeFile(path.join(uploadDir(), name), output);
  return `/media/${name}`;
}

/** Cheap first check by file signature, so obvious non-images fail with a clear message before uploading. */
function looksLikeImage(b: Buffer) {
  const hex = b.subarray(0, 12).toString("hex");
  const ascii = b.subarray(4, 12).toString("latin1");
  return hex.startsWith("ffd8ff") // JPEG
    || hex.startsWith("89504e47") // PNG
    || (hex.startsWith("52494646") && b.subarray(8, 12).toString("latin1") === "WEBP")
    || /^ftyp(heic|heix|hevc|mif1|msf1|avif)/.test(ascii); // HEIC / AVIF
}

async function uploadToCloudinary(image: Buffer) {
  const params: Record<string, string> = {
    allowed_formats: "jpg,png,webp,heic,heif,avif",
    folder: "wondervastra",
    format: "jpg",
    timestamp: String(Math.floor(Date.now() / 1000)),
    // fl_force_strip removes all photo metadata (GPS location, camera, date) from the stored file itself.
    transformation: "a_auto/c_limit,w_1600,h_2000/b_white/q_84/fl_force_strip",
  };
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const signature = createHash("sha1").update(`${toSign}${process.env.CLOUDINARY_API_SECRET}`).digest("hex");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(image)]));
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append("api_key", process.env.CLOUDINARY_API_KEY!);
  form.append("signature", signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Image upload failed");
  return json.secure_url as string;
}

/**
 * 1200x630 share image from a Cloudinary upload: the product centred on a blurred, zoomed copy of itself.
 * (Cloudinary's "blurred padding" only works for video, so the photo is layered over itself instead.)
 */
export function cloudinaryShareImage(url: string) {
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?:.*?\/)?(v\d+\/)?([^/]+(?:\/[^/]+)*?)\.(\w+)$/);
  if (!m) return null;
  const [, base, version = "", publicId, ext] = m;
  const layer = publicId.replace(/\//g, ":");
  return `${base}c_fill,w_1200,h_630/e_blur:1500/l_${layer},c_fit,w_1200,h_630/fl_layer_apply,g_center/f_jpg,q_82/${version}${publicId}.${ext}`;
}
