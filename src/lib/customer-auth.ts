/**
 * One customer account per email, however they log in: emailed code, password or Google.
 * Every method finds the account by its (lower-cased) email, so the same person always lands in the same account.
 */
import { and, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db, schema } from "@/db";
import { createSession } from "./auth";
import { newId, safeNext } from "./utils";

export type Customer = typeof schema.customers.$inferSelect;

export async function customerByEmail(email: string) {
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.email, email));
  return c ?? null;
}

/** The account for this email, created if it doesn't exist yet. */
export async function findOrCreateByEmail(email: string, extra: Partial<Pick<Customer, "name" | "googleSub" | "passwordHash">> = {}) {
  const existing = await customerByEmail(email);
  if (existing) return existing;
  const id = newId();
  await db.insert(schema.customers).values({ id, email, name: extra.name ?? null, googleSub: extra.googleSub ?? null, passwordHash: extra.passwordHash ?? null }).onConflictDoNothing();
  return (await customerByEmail(email))!;
}

/** Signs the customer in and works out where to send them, finishing a wishlist tap that sent them to log in. */
export async function finishLogin(c: Customer, next: string): Promise<{ error?: string; dest?: string }> {
  if (c.blocked) return { error: "This account has been disabled. Please contact us." };
  await db.update(schema.customers).set({ lastLoginAt: Date.now() }).where(eq(schema.customers.id, c.id));
  await createSession("customer", c.id);
  let dest = safeNext(next);
  const u = new URL(dest, "https://x.invalid");
  const wish = u.searchParams.get("wish");
  if (wish) {
    const [p] = await db.select({ id: schema.products.id }).from(schema.products).where(and(eq(schema.products.id, wish), eq(schema.products.status, "active")));
    if (p) await db.insert(schema.wishlist).values({ customerId: c.id, productId: p.id }).onConflictDoNothing();
    u.searchParams.delete("wish");
    dest = u.pathname + (u.search || "");
  }
  return { dest };
}

export const PASSWORD_MIN = 8;
export function passwordProblem(pw: string) {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > 200) return "That password is too long.";
  return null;
}

/* ---------- Google ---------- */

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
const AUTH_URL = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const b64url = (b: Buffer) => b.toString("base64url");

/** Start of "Continue with Google": a one-time state and PKCE verifier, kept in a short-lived cookie. */
export function googleStart(origin: string) {
  const state = b64url(randomBytes(18));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const url = new URL(AUTH_URL());
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: `${origin}/api/auth/google/callback`, response_type: "code",
    scope: "openid email profile", state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return { url: url.toString(), state, verifier };
}

type GoogleProfile = { sub: string; email: string; emailVerified: boolean; name: string | null };
/** Swaps the code for Google's ID token. It comes straight from Google over HTTPS, so its claims can be read directly. */
export async function googleProfile(code: string, verifier: string, origin: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_URL(), {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      code, code_verifier: verifier, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin}/api/auth/google/callback`, grant_type: "authorization_code",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || typeof json.id_token !== "string") throw new Error("Google sign-in didn't complete.");
  const claims = JSON.parse(Buffer.from(json.id_token.split(".")[1] ?? "", "base64url").toString("utf8"));
  const issOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com" || Boolean(process.env.GOOGLE_TOKEN_URL);
  if (!issOk || claims.aud !== process.env.GOOGLE_CLIENT_ID || !(Number(claims.exp) * 1000 > Date.now()) || !claims.sub || !claims.email) {
    throw new Error("Google sign-in didn't complete.");
  }
  return { sub: String(claims.sub), email: String(claims.email).trim().toLowerCase(), emailVerified: claims.email_verified === true || claims.email_verified === "true", name: claims.name ? String(claims.name).slice(0, 80) : null };
}

/** The account for a Google login: already linked → that one; same verified email → link it; otherwise a new account. */
export async function customerForGoogle(p: GoogleProfile) {
  const [linked] = await db.select().from(schema.customers).where(eq(schema.customers.googleSub, p.sub));
  if (linked) return linked;
  if (!p.emailVerified) throw new Error("Your Google email isn't verified yet. Please log in with an email code instead.");
  const c = await findOrCreateByEmail(p.email, { name: p.name, googleSub: p.sub });
  if (c.googleSub !== p.sub || (!c.name && p.name)) {
    await db.update(schema.customers).set({ googleSub: c.googleSub ?? p.sub, name: c.name ?? p.name }).where(eq(schema.customers.id, c.id));
  }
  return { ...c, googleSub: c.googleSub ?? p.sub, name: c.name ?? p.name };
}
