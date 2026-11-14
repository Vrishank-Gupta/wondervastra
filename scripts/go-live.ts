/**
 * One-time production setup, run from your computer against the live (Turso) database:
 *   npx tsx scripts/go-live.ts --listings=draft   (or --listings=live)
 *
 * 1. Creates/updates the tables (same migrations as local).
 * 2. Copies the catalogue (categories, brands, listings, photos, sales, cart offers, coupons) from
 *    preview/catalogue.db, which `npm run preview:snapshot` writes from your local store. Skipped if the
 *    live database already has listings, so re-running never overwrites real edits.
 * 3. Creates the owner admin login, and saves the store's contact details.
 *
 * Reads .env.cloudflare. Never touches customers or orders.
 */
import { config } from "dotenv";
config({ path: ".env.cloudflare", override: true });

import { randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("libsql://") && !url.startsWith("https://")) {
  console.error("DATABASE_URL in .env.cloudflare must be your Turso URL (libsql://…)."); process.exit(1);
}
const listings = process.argv.find((a) => a.startsWith("--listings="))?.split("=")[1];
if (listings !== "draft" && listings !== "live") { console.error("Pass --listings=draft or --listings=live"); process.exit(1); }

const { db, schema } = await import("../src/db");
const { migrate } = await import("drizzle-orm/libsql/migrator");
const { eq, sql } = await import("drizzle-orm");
const { hashPassword } = await import("../src/lib/passwords");
const { saveSettings } = await import("../src/lib/settings");
const { newId } = await import("../src/lib/utils");

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("✓ Tables ready");

const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.products);
if (Number(n) > 0) {
  console.log(`• Live database already has ${n} listings, catalogue not copied`);
} else {
  const src = createClient({ url: "file:preview/catalogue.db" });
  const remote = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  // Parents before children, so foreign keys hold.
  for (const table of ["categories", "brands", "products", "variants", "product_images", "sales", "cart_offers", "coupons"]) {
    const rows = (await src.execute(`select * from ${table}`)).rows;
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const stmts = rows.map((r) => {
      const values = cols.map((c) => (table === "products" && c === "status" && listings === "draft" && r[c] === "active" ? "draft" : r[c]));
      return { sql: `insert into ${table} (${cols.map((c) => `"${c}"`).join(",")}) values (${cols.map(() => "?").join(",")})`, args: values as never[] };
    });
    for (let i = 0; i < stmts.length; i += 100) await remote.batch(stmts.slice(i, i + 100), "write");
    console.log(`✓ Copied ${rows.length} ${table.replace("_", " ")}`);
  }
  if (listings === "draft") console.log("• Listings are drafts: check each one's price, stock and photos in Admin → Products, then set it Active");
}

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
if (email) {
  const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(schema.admins).where(eq(schema.admins.email, email));
  if (existing) await db.update(schema.admins).set({ passwordHash, active: true }).where(eq(schema.admins.id, existing.id));
  else await db.insert(schema.admins).values({ id: newId(), email, name: "Owner", passwordHash, role: "owner" });
  console.log(`✓ Admin login: ${email}${process.env.ADMIN_PASSWORD ? "" : `\n  Password: ${password}   ← save this now, it's shown only once`}`);
}

const contact = {
  supportEmail: process.env.SUPPORT_EMAIL?.trim() || undefined,
  whatsappNumber: process.env.SUPPORT_WHATSAPP?.trim() || undefined,
};
const set = Object.fromEntries(Object.entries(contact).filter(([, v]) => v));
if (Object.keys(set).length) { await saveSettings(set); console.log(`✓ Contact details saved: ${Object.values(set).join(", ")}`); }
process.exit(0);
