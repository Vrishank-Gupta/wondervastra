import { createHmac, timingSafeEqual } from "node:crypto";
import { devConveniences } from "./utils";

const API = "https://api.razorpay.com/v1";

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
/** Simulated payments only exist without real keys, and only in development or the automated tests. */
export function simulationAllowed() {
  return !razorpayConfigured() && devConveniences();
}
export function onlinePaymentsAvailable() {
  return razorpayConfigured() || simulationAllowed();
}
/** Test keys (rzp_test_…) take no real money: the store says so at checkout and on the dashboard. */
export function razorpayTestMode() {
  return razorpayConfigured() && (process.env.RAZORPAY_KEY_ID ?? "").startsWith("rzp_test_");
}
export function razorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID ?? "";
}
async function call<T>(path: string, body: unknown): Promise<T> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.description || `Razorpay error ${res.status}`);
  return json as T;
}
export function createRazorpayOrder(amount: number, receipt: string, notes: Record<string, string>) {
  return call<{ id: string; amount: number; currency: string }>("/orders", {
    amount, currency: "INR", receipt, notes, payment_capture: 1,
  });
}
export function refundPayment(paymentId: string, amount: number, notes: Record<string, string>) {
  return call<{ id: string; amount: number; status: string }>(`/payments/${paymentId}/refund`, { amount, notes });
}
function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, secret = process.env.RAZORPAY_KEY_SECRET ?? "") {
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}
export function verifyWebhookSignature(rawBody: string, signature: string, secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "") {
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
