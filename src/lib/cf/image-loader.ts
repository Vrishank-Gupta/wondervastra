/**
 * next/image loader for Cloudflare Workers, where Next's own optimiser doesn't run.
 * Cloudinary photos are resized and converted on Cloudinary's CDN; bundled /seed photos are served as they are.
 */
export default function loader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  if (src.includes("res.cloudinary.com/") && src.includes("/upload/")) {
    return src.replace("/upload/", `/upload/f_auto,q_${quality ?? "auto"},c_limit,w_${width}/`);
  }
  return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
}
