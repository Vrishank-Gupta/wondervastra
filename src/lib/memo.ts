/**
 * Short in-memory cache for read-mostly storefront data (catalogue, settings, sales).
 * Only on in production on Cloudflare (CATALOG_CACHE_SECONDS in wrangler.jsonc); off locally and in tests.
 * Cart quotes and checkout still read stock fresh, so a stale card can never oversell.
 * Only resolved values are shared between requests (Workers can't share in-flight I/O across requests).
 */
const store = new Map<string, { at: number; value: unknown }>();
const ttl = () => Number(process.env.CATALOG_CACHE_SECONDS ?? 0) * 1000;

export async function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const ms = ttl();
  if (!ms) return load();
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value as T;
  const value = await load();
  store.set(key, { at: Date.now(), value });
  return value;
}
/** After an admin change, this instance shows it immediately; others within the cache window. */
export function clearMemo() { store.clear(); }
