import { emailConfigured, whatsappConfigured } from "./notifications";
import { onlinePaymentsAvailable, razorpayConfigured } from "./razorpay";

/**
 * What the store can actually do right now, so the site never promises a channel that isn't connected
 * (e.g. "Pay by UPI" before Razorpay is live, or "updates on WhatsApp" before WhatsApp is set up).
 */
export function capabilities() {
  return {
    onlinePayments: onlinePaymentsAvailable(),
    razorpay: razorpayConfigured(),
    email: emailConfigured(),
    whatsapp: whatsappConfigured(),
  };
}
export type Capabilities = ReturnType<typeof capabilities>;

export { paymentLine } from "./payment-copy";
