import { randomBytes } from "node:crypto";

export function newId() {
  return randomBytes(9).toString("base64url");
}
export function newToken() {
  return randomBytes(24).toString("base64url");
}
export function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
/** A same-site path to send someone back to after login. Anything else (other sites, protocol-relative or backslash tricks) becomes the fallback. */
export function safeNext(next: unknown, fallback = "/account") {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || /[\\\s]/.test(next) || next.length > 300) return fallback;
  try { return new URL(next, "https://x.invalid").origin === "https://x.invalid" ? next : fallback; } catch { return fallback; }
}
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
/**
 * Development conveniences (simulated payment, login code shown on screen).
 * On in `next dev`. A production build allows them only for the automated tests:
 * VV_TEST_MODE=1 and a localhost site address, which a live store never has.
 */
export function devConveniences() {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.VV_TEST_MODE !== "1") return false;
  try { return ["localhost", "127.0.0.1"].includes(new URL(siteUrl()).hostname); } catch { return false; }
}
export function escapeHtml(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
/** Accepts 10-digit Indian mobiles with optional +91 / 0 prefix. Returns 10 digits or null. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const e = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}
