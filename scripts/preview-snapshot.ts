/**
 * Builds preview/catalogue.db for a look-only preview deployment (PREVIEW_MODE=1):
 * a copy of the current catalogue with every private table emptied.
 *   npx tsx scripts/preview-snapshot.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const source = (process.env.DATABASE_URL || "file:./data/vastravibe.db").replace(/^file:/, "");
const out = path.resolve("preview/catalogue.db");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });

const src = createClient({ url: `file:${source}` });
await src.execute({ sql: "VACUUM INTO ?", args: [out] });
src.close();

const db = createClient({ url: `file:${out}` });
// Nothing personal or privileged ships in a preview.
const PRIVATE = ["admins", "sessions", "customers", "addresses", "wishlist", "otp_codes", "rate_limits", "orders", "order_items", "order_events",
  "audit_logs", "notifications", "stock_alerts", "stock_movements", "feedback", "return_requests"];
const tables = new Set((await db.execute("select name from sqlite_master where type='table'")).rows.map((r) => String(r.name)));
for (const t of PRIVATE) if (tables.has(t)) await db.execute(`delete from "${t}"`);
// Only published reviews are public anyway; drop the rest.
if (tables.has("reviews")) await db.execute("delete from reviews where status != 'approved'");
await db.execute("VACUUM");
const [{ n }] = (await db.execute("select count(*) n from products where status='active'")).rows;
db.close();
console.log(`✓ preview/catalogue.db written with ${n} live listings and no customer, order or admin data`);
