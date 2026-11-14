import { siteUrl } from "./utils";

/** Public by design: search engines fetch /<key>.txt from the site to confirm the ping came from its owner. */
export const INDEXNOW_KEY = "03eb3bf037857d9b10a22c0361205d80";

/**
 * Tells Bing (which powers ChatGPT search and Copilot), Yandex and others that pages changed, so new or
 * updated listings show up in hours instead of weeks. Best effort: a failure never blocks the admin.
 */
export async function pingIndexNow(paths: string[]) {
  const base = siteUrl();
  if (!paths.length || !base.startsWith("https://") || base.includes("localhost")) return;
  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: new URL(base).host, key: INDEXNOW_KEY, keyLocation: `${base}/${INDEXNOW_KEY}.txt`, urlList: paths.map((p) => `${base}${p}`) }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error("IndexNow ping failed", e);
  }
}
