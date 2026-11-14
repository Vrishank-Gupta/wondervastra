import "dotenv/config";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { hashPassword } from "../src/lib/passwords";
import { newId } from "../src/lib/utils";

const email = (process.argv[2] || process.env.ADMIN_EMAIL || "").toLowerCase();
if (!email) { console.error("Usage: npm run admin:create -- you@example.com [password]"); process.exit(1); }
const password = process.argv[3] || process.env.ADMIN_PASSWORD || randomBytes(9).toString("base64url");
const passwordHash = await hashPassword(password);
const [existing] = await db.select().from(schema.admins).where(eq(schema.admins.email, email));
if (existing) await db.update(schema.admins).set({ passwordHash, active: true }).where(eq(schema.admins.id, existing.id));
else await db.insert(schema.admins).values({ id: newId(), email, name: "Owner", passwordHash, role: "owner" });
console.log(`✓ Admin ready: ${email}${process.argv[3] || process.env.ADMIN_PASSWORD ? "" : `\n  Password: ${password}  (shown once)`}`);
process.exit(0);
