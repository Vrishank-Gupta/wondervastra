/** Cloudflare build: sharp is native code and can't run on Workers. Production images go through Cloudinary instead. */
export default function sharp(): never {
  throw new Error("Image processing isn't available on this host. Set the Cloudinary keys to upload photos.");
}
