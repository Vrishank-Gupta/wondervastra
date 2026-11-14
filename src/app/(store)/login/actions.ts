"use server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { checkOtp, clientIp, createSession, destroySession, issueOtp, rateLimit } from "@/lib/auth";
import { emailConfigured, sendOtpMessage, whatsappConfigured } from "@/lib/notifications";
import { devConveniences, newId, normalizeEmail, normalizePhone, safeNext } from "@/lib/utils";
import { redirect } from "next/navigation";

function parse(input: string) {
  return normalizeEmail(input) ?? normalizePhone(input);
}

export async function requestOtp(input: string): Promise<{ error?: string; identifier?: string; devCode?: string }> {
  const identifier = parse(input);
  if (!identifier) return { error: "Enter a valid email or 10-digit mobile number." };
  const ip = await clientIp();
  if (!(await rateLimit(`otp:id:${identifier}`, 5, 15 * 60_000)) || !(await rateLimit(`otp:ip:${ip}`, 20, 15 * 60_000))) {
    return { error: "Too many codes requested. Please wait a few minutes." };
  }
  const isEmail = identifier.includes("@");
  const configured = isEmail ? emailConfigured() : whatsappConfigured();
  const dev = devConveniences();
  if (!configured && !dev) {
    return { error: isEmail ? "Email login is being set up. Please try again later." : "WhatsApp login isn't available yet. Please use your email." };
  }
  const code = await issueOtp(identifier);
  await sendOtpMessage(identifier, code);
  // Only outside production, and only with no provider set up.
  return { identifier, devCode: !configured && dev ? code : undefined };
}

export async function verifyOtp(identifier: string, code: string, next: string): Promise<{ error?: string }> {
  const ip = await clientIp();
  if (!(await rateLimit(`verify:${ip}`, 30, 15 * 60_000))) return { error: "Too many attempts. Please wait a few minutes." };
  if (!(await checkOtp(identifier, code))) return { error: "That code isn't right, or it has expired." };
  const isEmail = identifier.includes("@");
  const col = isEmail ? schema.customers.email : schema.customers.phone;
  let [c] = await db.select().from(schema.customers).where(eq(col, identifier));
  if (!c) {
    const id = newId();
    await db.insert(schema.customers).values({ id, email: isEmail ? identifier : null, phone: isEmail ? null : identifier });
    [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id));
  }
  if (c.blocked) return { error: "This account has been disabled. Please contact us." };
  await db.update(schema.customers).set({ lastLoginAt: Date.now() }).where(eq(schema.customers.id, c.id));
  await createSession("customer", c.id);
  redirect(safeNext(next));
}

export async function logout() {
  await destroySession("customer");
  redirect("/");
}

export async function updateName(name: string) {
  const { getCustomer } = await import("@/lib/auth");
  const c = await getCustomer();
  if (c) await db.update(schema.customers).set({ name: name.slice(0, 80) }).where(eq(schema.customers.id, c.id));
}
