import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "./utils";

const COOKIE = { customer: "vv_session", admin: "vv_admin" } as const;
const DAY = 86_400_000;
const TTL = { customer: 60 * DAY, admin: 7 * DAY } as const;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");


export async function createSession(type: "customer" | "admin", subjectId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    tokenHash: sha(token),
    subjectType: type,
    subjectId,
    expiresAt: Date.now() + TTL[type],
  });
  const jar = await cookies();
  jar.set(COOKIE[type], token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL[type] / 1000,
  });
}
async function subjectFromCookie(type: "customer" | "admin") {
  const jar = await cookies();
  const token = jar.get(COOKIE[type])?.value;
  if (!token) return null;
  const [row] = await db.select().from(schema.sessions)
    .where(and(eq(schema.sessions.tokenHash, sha(token)), eq(schema.sessions.subjectType, type), gt(schema.sessions.expiresAt, Date.now())));
  return row?.subjectId ?? null;
}
export async function destroySession(type: "customer" | "admin") {
  const jar = await cookies();
  const token = jar.get(COOKIE[type])?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha(token)));
  jar.delete(COOKIE[type]);
}

export const getCustomer = cache(async () => {
  const id = await subjectFromCookie("customer");
  if (!id) return null;
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id));
  return c && !c.blocked ? c : null;
});
export async function requireCustomer(next = "/account") {
  const c = await getCustomer();
  if (!c) redirect(`/login?next=${encodeURIComponent(next)}`);
  return c;
}
export const getAdmin = cache(async () => {
  const id = await subjectFromCookie("admin");
  if (!id) return null;
  const [a] = await db.select().from(schema.admins).where(eq(schema.admins.id, id));
  return a?.active ? a : null;
});
export async function requireAdmin() {
  const a = await getAdmin();
  if (!a) redirect("/admin/login");
  return a;
}
export async function requireOwner() {
  const a = await requireAdmin();
  if (a.role !== "owner") throw new Error("Only the store owner can do this.");
  return a;
}

/** Fixed-window limiter stored in the DB, so it works across processes. */
export async function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const [row] = await db.select().from(schema.rateLimits).where(eq(schema.rateLimits.key, key));
  if (!row || now - row.windowStart > windowMs) {
    await db.insert(schema.rateLimits).values({ key, count: 1, windowStart: now })
      .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count: 1, windowStart: now } });
    return true;
  }
  if (row.count >= limit) return false;
  await db.update(schema.rateLimits).set({ count: row.count + 1 }).where(eq(schema.rateLimits.key, key));
  return true;
}
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

const OTP_TTL = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
export async function issueOtp(identifier: string) {
  const code = String(randomInt(100000, 1000000));
  await db.update(schema.otpCodes).set({ consumedAt: Date.now() })
    .where(and(eq(schema.otpCodes.identifier, identifier), isNull(schema.otpCodes.consumedAt)));
  await db.insert(schema.otpCodes).values({
    id: newId(), identifier, codeHash: sha(`${identifier}:${code}`), expiresAt: Date.now() + OTP_TTL,
  });
  await db.delete(schema.otpCodes).where(lt(schema.otpCodes.expiresAt, Date.now() - DAY));
  return code;
}
export async function checkOtp(identifier: string, code: string) {
  const [row] = await db.select().from(schema.otpCodes)
    .where(and(eq(schema.otpCodes.identifier, identifier), isNull(schema.otpCodes.consumedAt), gt(schema.otpCodes.expiresAt, Date.now())))
    .orderBy(desc(schema.otpCodes.createdAt)).limit(1);
  if (!row || row.attempts >= OTP_MAX_ATTEMPTS) return false;
  if (sha(`${identifier}:${code.trim()}`) !== row.codeHash) {
    await db.update(schema.otpCodes).set({ attempts: row.attempts + 1 }).where(eq(schema.otpCodes.id, row.id));
    return false;
  }
  await db.update(schema.otpCodes).set({ consumedAt: Date.now() }).where(eq(schema.otpCodes.id, row.id));
  return true;
}
