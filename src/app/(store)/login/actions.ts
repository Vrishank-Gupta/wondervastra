"use server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { checkOtp, clientIp, destroySession, getCustomer, issueOtp, rateLimit } from "@/lib/auth";
import { customerByEmail, findOrCreateByEmail, finishLogin, passwordProblem } from "@/lib/customer-auth";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { emailConfigured, sendOtpMessage, whatsappConfigured } from "@/lib/notifications";
import { devConveniences, newId, normalizeEmail, normalizePhone } from "@/lib/utils";
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
  let c;
  if (isEmail) c = await findOrCreateByEmail(identifier);
  else {
    [c] = await db.select().from(schema.customers).where(eq(schema.customers.phone, identifier));
    if (!c) {
      const id = newId();
      await db.insert(schema.customers).values({ id, phone: identifier });
      [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id));
    }
  }
  const r = await finishLogin(c, next);
  if (r.error) return r;
  redirect(r.dest!);
}

/* ---------- email + password ---------- */

const WRONG = "That email and password don't match. Try again, or log in with a code.";
export async function passwordLogin(emailInput: string, password: string, next: string): Promise<{ error?: string }> {
  const email = normalizeEmail(emailInput);
  if (!email || !password) return { error: "Enter your email and password." };
  const ip = await clientIp();
  if (!(await rateLimit(`pw:ip:${ip}`, 20, 15 * 60_000)) || !(await rateLimit(`pw:id:${email}`, 10, 15 * 60_000))) {
    return { error: "Too many tries. Please wait 15 minutes, or log in with an email code." };
  }
  const c = await customerByEmail(email);
  if (!c?.passwordHash) {
    // Same wording either way, so the form can't be used to find out who has an account.
    return { error: c ? "This account doesn't have a password yet. Log in with an email code, or use “Forgot password?” to set one." : WRONG };
  }
  if (!(await verifyPassword(password, c.passwordHash))) return { error: WRONG };
  const r = await finishLogin(c, next);
  if (r.error) return r;
  redirect(r.dest!);
}

/** Sign-up and "forgot password" both start by emailing a code: only the owner of the email can set its password. */
export async function sendEmailCode(emailInput: string, purpose: "signup" | "reset"): Promise<{ error?: string; email?: string; devCode?: string }> {
  const email = normalizeEmail(emailInput);
  if (!email) return { error: "Enter a valid email address." };
  if (purpose === "signup") {
    const c = await customerByEmail(email);
    if (c?.passwordHash) return { error: "You already have an account with this email. Log in, or use “Forgot password?”." };
  }
  const r = await requestOtp(email);
  return r.error ? { error: r.error } : { email, devCode: r.devCode };
}

export async function completeEmailCode(input: { email: string; code: string; password: string; name?: string; next: string }): Promise<{ error?: string }> {
  const email = normalizeEmail(input.email);
  if (!email) return { error: "Enter a valid email address." };
  const problem = passwordProblem(input.password);
  if (problem) return { error: problem };
  const ip = await clientIp();
  if (!(await rateLimit(`verify:${ip}`, 30, 15 * 60_000))) return { error: "Too many attempts. Please wait a few minutes." };
  if (!(await checkOtp(email, input.code))) return { error: "That code isn't right, or it has expired." };
  const name = input.name?.trim().slice(0, 80) || null;
  const c = await findOrCreateByEmail(email, { name });
  await db.update(schema.customers).set({ passwordHash: await hashPassword(input.password), name: c.name ?? name }).where(eq(schema.customers.id, c.id));
  // A new password signs out every other device.
  await db.delete(schema.sessions).where(and(eq(schema.sessions.subjectType, "customer"), eq(schema.sessions.subjectId, c.id)));
  const r = await finishLogin(c, input.next);
  if (r.error) return r;
  redirect(r.dest!);
}

/** From the account page: add a password, or change it (the current one is needed if there is one). */
export async function setAccountPassword(current: string, next: string): Promise<{ error?: string; ok?: boolean }> {
  const c = await getCustomer();
  if (!c) return { error: "Please log in again." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (!(await rateLimit(`pwset:${c.id}`, 10, 15 * 60_000))) return { error: "Too many tries. Please wait a few minutes." };
  if (c.passwordHash && !(await verifyPassword(current, c.passwordHash))) return { error: "Your current password isn't right." };
  await db.update(schema.customers).set({ passwordHash: await hashPassword(next) }).where(eq(schema.customers.id, c.id));
  return { ok: true };
}

export async function logout() {
  await destroySession("customer");
  redirect("/");
}

export async function updateName(name: string) {
  const c = await getCustomer();
  if (c) await db.update(schema.customers).set({ name: name.slice(0, 80) }).where(eq(schema.customers.id, c.id));
}
