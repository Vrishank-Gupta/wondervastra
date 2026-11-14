import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings, type StoreSettings } from "@/lib/settings";

type Page = { title: string; body: (s: StoreSettings) => React.ReactNode };

const contactLine = (s: StoreSettings) => s.supportEmail || s.whatsappNumber ? `at ${[s.supportEmail, s.whatsappNumber].filter(Boolean).join(" or ")}` : "through our contact page";

const PAGES: Record<string, Page> = {
  about: { title: "Our story", body: (s) => <>
    <p>{s.storeName} started with a simple idea: the everyday things you wear should be made well. We bring the innerwear and thermal brands you already trust into one easy store: 100% original products, at the lowest prices we can offer, and we're building our own label, starting with hoodies.</p>
    <h2>What we care about</h2>
    <ul><li>Comfort you can wear all day</li><li>Colours that go with what you already own</li><li>Honest pricing and clear delivery charges</li><li>Keeping you updated at every step of your order</li></ul>
  </> },
  contact: { title: "Contact us", body: (s) => <>
    <p>Questions about an order or a product? We&apos;d love to help.</p>
    {s.whatsappNumber && <p><b>WhatsApp:</b> {s.whatsappNumber}</p>}
    {s.supportEmail && <p><b>Email:</b> {s.supportEmail}</p>}
    {s.legalName && <p><b>Business name:</b> {s.legalName}</p>}
    {s.businessAddress && <p><b>Address:</b> {s.businessAddress}</p>}
    {s.gstin && <p><b>GSTIN:</b> {s.gstin}</p>}
    <p>Please keep your order number handy so we can help you faster.</p>
  </> },
  faq: { title: "FAQs", body: (s) => <>
    <h2>Do I need an account to order?</h2><p>No. You can check out as a guest and track your order with the link we send you.</p>
    <h2>How do I pay?</h2><p>UPI, cards, netbanking and wallets through Razorpay{s.codEnabled ? ", or cash on delivery on eligible items" : ""}.</p>
    <h2>When will my order arrive?</h2><p>We dispatch within {s.dispatchDays} working days, and delivery usually takes {s.deliveryDaysMin}–{s.deliveryDaysMax} days after that depending on your location.</p>
    <h2>How do I track my order?</h2><p>We&apos;ll send you a tracking link on email and WhatsApp when it ships. You can also use the Track Order page anytime.</p>
    <h2>Can I cancel my order?</h2><p>Yes, from your order page, until it has been packed.</p>
    <h2>Can I return an item?</h2><p>Eligible items can be returned within {s.returnWindowDays} days of delivery. For hygiene reasons, items must be unused with original packaging. See our returns policy.</p>
    <h2>An item is sold out. Will it come back?</h2><p>Tap &ldquo;Notify me&rdquo; on the product page and we&apos;ll message you as soon as it&apos;s restocked.</p>
  </> },
  "shipping-policy": { title: "Shipping policy", body: (s) => <>
    <p>We ship across India through trusted courier partners.</p>
    <h2>Dispatch & delivery time</h2><p>Orders are dispatched within {s.dispatchDays} working days. Delivery usually takes {s.deliveryDaysMin}–{s.deliveryDaysMax} days after dispatch, and may take longer for remote areas.</p>
    <h2>Delivery charges</h2><p>Delivery charges depend on the item and are shown on each product page, in your cart and at checkout before you pay. Many items and larger orders ship free.</p>
    <h2>Tracking</h2><p>When your order ships, you&apos;ll get the courier name, AWB number and tracking link by email and WhatsApp.</p>
    <h2>Failed delivery</h2><p>If delivery fails because of an incorrect address or if the recipient is unavailable, please contact us {contactLine(s)}.</p>
  </> },
  "returns-policy": { title: "Returns & refunds", body: (s) => <>
    <h2>Return window</h2><p>You can request a return within {s.returnWindowDays} days of delivery from your order page. Items marked as non-returnable on the product page can&apos;t be returned. For hygiene reasons this usually includes briefs, trunks and women&apos;s innerwear, unless they arrive damaged or wrong.</p>
    <h2>Condition</h2><p>For hygiene reasons, items must be unused, unwashed and in their original packaging.</p>
    <h2>Damaged or wrong item</h2><p>If you received something damaged or incorrect, contact us {contactLine(s)} within 48 hours of delivery, with photos if possible.</p>
    <h2>Refunds</h2><p>After we receive and check the return, refunds go to your original payment method. Banks usually take 5–7 working days to show the amount. For cash on delivery orders, we&apos;ll ask for your UPI or bank details.</p>
    <h2>Cancellations</h2><p>You can cancel from your order page until it has been packed. Prepaid cancellations are refunded in full.</p>
  </> },
  "privacy-policy": { title: "Privacy policy", body: (s) => <>
    <p>This policy explains how {s.legalName || s.storeName} handles your information.</p>
    <h2>What we collect</h2><p>Your name, contact details and delivery address when you order; order history; and basic data on how you found us (such as a link from Instagram or WhatsApp).</p>
    <h2>Payments</h2><p>Payments are processed by Razorpay. We never see or store your card, UPI or banking credentials.</p>
    <h2>How we use it</h2><p>To fulfil your order, send order and delivery updates by email and WhatsApp, provide support, and improve our store. We share only what&apos;s needed with couriers and service providers that help us do this. We don&apos;t sell your data.</p>
    <h2>Your choices</h2><p>You can opt out of WhatsApp updates at checkout and ask us to access or delete your data by contacting us {contactLine(s)}.</p>
  </> },
  terms: { title: "Terms of use", body: (s) => <>
    <p>By using this site and placing an order with {s.legalName || s.storeName}, you agree to these terms.</p>
    <h2>Orders & pricing</h2><p>All prices are in Indian Rupees and include applicable taxes. We may cancel an order and refund you in full if an item is unavailable or a price was clearly listed in error.</p>
    <h2>Offers</h2><p>Sales and coupons are valid for the stated period and conditions. Per-order and per-customer quantity limits may apply.</p>
    <h2>Products</h2><p>We try to show colours and details accurately, but your screen may vary slightly from the actual product.</p>
    <h2>Governing law</h2><p>These terms are governed by the laws of India.</p>
  </> },
};

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = PAGES[(await params).slug];
  return p ? { title: p.title } : {};
}
export default async function InfoPage({ params }: Props) {
  const p = PAGES[(await params).slug];
  if (!p) notFound();
  const s = await getSettings();
  return (
    <div className="container-x py-8">
      <article className="mx-auto max-w-2xl">
        <h1 className="text-4xl sm:text-5xl">{p.title}</h1>
        <div className="prose-vv mt-5">{p.body(s)}</div>
      </article>
    </div>
  );
}
