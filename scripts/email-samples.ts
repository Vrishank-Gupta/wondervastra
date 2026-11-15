/**
 * Every email the store sends, filled with realistic sample data, to check how they look.
 *   Save as HTML files:  npx tsx scripts/email-samples.ts --out ./email-samples
 *   Send them all:       npx tsx scripts/email-samples.ts --send you@example.com
 * Sending needs RESEND_API_KEY and EMAIL_FROM (e.g. from .env.cloudflare). The daily summary uses the
 * real database when DATABASE_URL is set; nothing is written to it except the sent-mail log.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  adminNewOrderEmail, adminReturnEmail, backInStockEmail, buildOrderMessage, contactEmail, otpEmail, renderEmail, type OrderEventName,
} from "../src/lib/notifications";

const args = process.argv.slice(2);
const out = args[args.indexOf("--out") + 1] && args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const to = args.includes("--send") ? args[args.indexOf("--send") + 1] : null;
if (!out && !to) { console.log("Use --out <dir> or --send <email>"); process.exit(1); }

const IMG = {
  luxTop: "https://res.cloudinary.com/adsgsh0s/image/upload/v1794719793/wondervastra/hjxnyrasjmn2gus65hye.jpg",
  dollarKids: "https://res.cloudinary.com/adsgsh0s/image/upload/v1794719132/wondervastra/wmvrvyl3msmk12rcddyd.jpg",
  amulKids: "https://res.cloudinary.com/adsgsh0s/image/upload/v1794720766/wondervastra/vatpmixzvlydvwgosnbp.png",
};
const now = Date.now();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const order: any = {
  id: "sample-order", number: "WV-10023", accessToken: "sample", name: "Priya Sharma", email: "priya.sharma@example.com", phone: "9876543210",
  line1: "B-42, Second Floor, Greater Kailash 1", line2: "Near M Block Market", city: "New Delhi", state: "Delhi", pincode: "110048",
  subtotal: 168000, mrpTotal: 239800, offerName: "Pick any 5, extra 5% off", offerDiscount: 8400, couponCode: null, couponDiscount: 0,
  shippingTotal: 0, codFee: 0, total: 159600, refundedTotal: 159600, paymentMethod: "razorpay", paymentStatus: "paid", status: "confirmed",
  courier: "Delhivery", awb: "38455510023471", trackingUrl: "https://www.delhivery.com/track-v2/package/38455510023471",
  customerNote: "Please call before delivery, the bell doesn't work.", placedAt: now, etaAt: now + 3 * 86_400_000, deliveredAt: null,
};
const items = [
  { id: "i1", name: "Lux Inferno Men's Thermal Warmer", variantLabel: "Top · Size L (90 cm)", qty: 1, unitPrice: 37000, unitMrp: 62500, image: IMG.luxTop, sku: "LUX-INFERNOM-TOP-90" },
  { id: "i2", name: "Lux Inferno Men's Thermal Warmer", variantLabel: "Bottom · Size L (90 cm)", qty: 1, unitPrice: 37000, unitMrp: 62500, image: IMG.luxTop, sku: "LUX-INFERNOM-BTM-90" },
  { id: "i3", name: "Dollar Ultra Kids' Thermal Warmer", variantLabel: "Top · Size 4–5 Y (55 cm)", qty: 2, unitPrice: 25000, unitMrp: 35500, image: IMG.dollarKids, sku: "DOL-ULTRAK-TOP-55" },
  { id: "i4", name: "Amul Comfy Kids' Thermal Warmer, V-Neck", variantLabel: "Bottom · Size 3–4 Y (55 cm)", qty: 1, unitPrice: 22000, unitMrp: 26200, image: IMG.amulKids, sku: "AMU-COMFYK-BTM-55" },
];
const support = "support@wondervastra.in";
const footer = "You're receiving this because you ordered from WonderVastra.";
const ret = (status: string, extra: object = {}) => ({ id: "r1", orderId: order.id, status, reason: "Size too small", details: "My son is 5 but the 4–5 Y top is tight at the chest. Can I get the next size?", photos: ["a", "b"], items: [{ itemId: "i3", qty: 2 }], adminNote: null, pickupAwb: null, ...extra });

const mails: { name: string; subject: string; html: string }[] = [];
const cust = (name: string, event: OrderEventName, o = order, r: object | null = null) => {
  const m = buildOrderMessage(event, o, { orderFeedback: true, deliveryFeedback: true, items, ret: r as never, returnDays: 3 });
  mails.push({ name, subject: m.subject, html: renderEmail(m, footer, { supportEmail: support }) });
};
cust("01-order-confirmed", "order_placed");
cust("02-order-packed", "order_packed", { ...order, status: "packed" });
cust("03-order-shipped", "order_shipped", { ...order, status: "shipped" });
cust("04-tracking-changed", "tracking_updated", { ...order, status: "shipped" });
cust("05-out-for-delivery", "out_for_delivery", { ...order, status: "out_for_delivery" });
cust("06-delivered", "order_delivered", { ...order, status: "delivered", deliveredAt: now - 3600_000 });
cust("07-cancelled", "order_cancelled", { ...order, status: "cancelled" });
cust("08-refunded", "order_refunded", { ...order, status: "delivered", refundedTotal: 50000 });
cust("09-return-requested", "return_update", order, ret("requested"));
cust("10-return-approved", "return_update", order, ret("approved", { pickupAwb: "38455510099812" }));
cust("11-return-rejected", "return_update", order, ret("rejected", { adminNote: "The photos show the item was washed. We can only take back unused items." }));
cust("12-return-picked-up", "return_update", order, ret("picked_up"));
cust("13-return-received", "return_update", order, ret("received"));
cust("14-return-refunded", "return_update", order, ret("completed"));
{ const m = otpEmail("482913"); mails.push({ name: "15-login-code", ...m }); }
{ const m = backInStockEmail("Dollar Ultra Kids' Thermal Warmer", "dollar-ultra-kids-thermal-warmer", false, { image: IMG.dollarKids, price: 46000, mrp: 65000 }, support); mails.push({ name: "16-back-in-stock", ...m }); }
{ const m = backInStockEmail("Amul Comfy Kids' Thermal Warmer, V-Neck", "amul-comfy-kids-thermal-warmer-v-neck", true, { image: IMG.amulKids, price: 42000, mrp: 50600 }, support); mails.push({ name: "17-new-launch", ...m }); }
{ const m = adminNewOrderEmail(order, items); mails.push({ name: "18-admin-new-order", ...m }); }
{ const m = adminReturnEmail(order, ret("requested") as never, items); mails.push({ name: "19-admin-return-request", ...m }); }
{ const m = contactEmail({ name: "Rahul Verma", email: "rahul.verma@example.com", phone: "9811122233", order: "WV-10019", message: "Hi, I ordered a Dollar Ultra set for my daughter (6–7 Y).\nCan you deliver it before Saturday? We're travelling to Shimla on Sunday.\n\nThanks!" }); mails.push({ name: "20-admin-contact-form", ...m }); }

async function main() {
  if (process.env.DATABASE_URL) {
    const { buildDailySummary, dailySummaryHtml } = await import("../src/lib/daily-summary");
    const m = await buildDailySummary();
    mails.push({ name: "21-admin-daily-summary", subject: m.subject, html: dailySummaryHtml(m) });
  }
  if (out) {
    mkdirSync(out, { recursive: true });
    for (const m of mails) writeFileSync(`${out}/${m.name}.html`, m.html);
    console.log(`Saved ${mails.length} emails to ${out}`);
  }
  if (to) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    for (const m of mails) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM || "WonderVastra <onboarding@resend.dev>", to, subject: `[Sample ${m.name.slice(0, 2)}] ${m.subject}`, html: m.html, reply_to: support }),
      });
      console.log(res.ok ? "sent" : `FAILED ${res.status} ${await res.text()}`, m.name);
      await new Promise((r) => setTimeout(r, 600)); // Resend allows 2 emails a second
    }
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
