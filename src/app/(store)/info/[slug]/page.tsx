import { areaPhrase, faqPage, JsonLd } from "@/lib/seo";
import { waLink } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings, type StoreSettings } from "@/lib/settings";
import { capabilities } from "@/lib/capabilities";

/** "email and WhatsApp" only when both are really connected. */
const channels = () => (capabilities().whatsapp ? "email and WhatsApp" : "email");

type Page = { title: string; body: (s: StoreSettings) => React.ReactNode };

const contactLine = (s: StoreSettings) => s.supportEmail || s.whatsappNumber ? `at ${[s.supportEmail, s.whatsappNumber].filter(Boolean).join(" or ")}` : "through our contact page";

/** One source for the FAQ page and its FAQPage search data, so both always say the same thing. */
function faqItems(s: StoreSettings): { q: string; a: string }[] {
  const online = capabilities().onlinePayments;
  return [
    { q: "Are your products original?", a: "Yes. Everything we sell is 100% original branded stock, never copies, at the lowest prices we can offer." },
    { q: "Do I need an account to order?", a: "No. You can check out as a guest and track your order with the link we send you." },
    { q: "How do I pay?", a: online ? `UPI, cards, netbanking and wallets through Razorpay${s.codEnabled ? ", or cash on delivery on eligible items" : ""}.` : s.codEnabled ? "Cash on delivery on eligible items. Online payment (UPI and cards) is opening soon." : "Online payment is opening soon. Please contact us to order." },
    s.deliveryPincodes.trim()
      ? { q: "Where do you deliver?", a: `We deliver across ${areaPhrase(s)} for now. Enter your pincode on any product page to check. If we don't reach you yet, leave your number there and we'll tell you as soon as we do.` }
      : { q: "Do you deliver across India?", a: "Yes. We ship across India through trusted courier partners, and delivery is free on every order." },
    { q: "When will my order arrive?", a: `We dispatch within ${s.dispatchDays} working days, and delivery usually takes ${s.deliveryDaysMin}–${s.deliveryDaysMax} days after that depending on your location.` },
    { q: "What sizes do kids' thermals come in?", a: "Kids' warmers fit ages 2 to 11 years, in sizes 45 to 75 cm. Each listing shows the age with every size and has the brand's size guide. Kids' wear is sold in twos: mix any sizes, tops and trousers." },
    { q: "Is delivery free?", a: "Yes, on every order, with no minimum." },
    { q: "How do I track my order?", a: `We'll send you a tracking link by ${channels()} when it ships. You can also use the Track Order page anytime.` },
    { q: "Can I cancel my order?", a: "Yes, from your order page, until it has been packed." },
    { q: "Can I return an item?", a: `Eligible items can be returned within ${s.returnWindowDays} days of delivery. For hygiene reasons, items must be unused with original packaging. See our returns policy.` },
    { q: "An item is sold out. Will it come back?", a: "Tap “Notify me” on the product page and we'll message you as soon as it's restocked." },
  ];
}

const PAGES: Record<string, Page> = {
  about: { title: "Our story", body: (s) => <>
    <p>{s.storeName} started with a simple idea: the everyday things you wear should be made well. We bring the thermal brands you already trust into one easy store, starting with warm layers for kids, babies and men: 100% original products, at the lowest prices we can offer.</p>
    <h2>What we care about</h2>
    <ul><li>Comfort you can wear all day</li><li>Colours that go with what you already own</li><li>Honest pricing and free delivery on every order</li><li>Keeping you updated at every step of your order</li></ul>
  </> },
  contact: { title: "Contact us", body: (s) => <>
    <p>Questions about an order or a product? We&apos;d love to help.</p>
    {s.whatsappNumber && <p><b>WhatsApp:</b> <a href={waLink(s.whatsappNumber)} target="_blank" rel="noreferrer">{s.whatsappNumber}</a> (chat with us)</p>}
    {s.supportEmail && <p><b>Email:</b> <a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a></p>}
    {s.supportHours && (s.whatsappNumber || s.supportEmail) && <p><b>Hours:</b> {s.supportHours}</p>}
    {s.whatsappGroupUrl && <p><b>WhatsApp group:</b> <a href={s.whatsappGroupUrl} target="_blank" rel="noreferrer">Join for new arrivals and deals</a></p>}
    {s.legalName && <p><b>Business name:</b> {s.legalName}</p>}
    {s.businessAddress && <p><b>Address:</b> {s.businessAddress}</p>}
    {s.gstin && <p><b>GSTIN:</b> {s.gstin}</p>}
    <p>Please keep your order number handy so we can help you faster.</p>
  </> },
  faq: { title: "FAQs", body: (s) => <>{faqItems(s).map((x) => <div key={x.q}><h2>{x.q}</h2><p>{x.a}</p></div>)}</> },
  "shipping-policy": { title: "Shipping policy", body: (s) => <>
    {s.deliveryPincodes.trim()
      ? <><h2>Where we deliver</h2><p>We deliver across {areaPhrase(s)} for now. Enter your pincode on any product page or at checkout to check. If we don&apos;t deliver to you yet, leave your number and we&apos;ll tell you when we do.</p></>
      : <p>We ship across India through trusted courier partners.</p>}
    <h2>Dispatch & delivery time</h2><p>Orders are dispatched within {s.dispatchDays} working days. Delivery usually takes {s.deliveryDaysMin}–{s.deliveryDaysMax} days after dispatch.</p>
    <h2>Free delivery</h2><p>Every order ships free, whatever its size. There is no minimum order.</p>
    <h2>Tracking</h2><p>When your order ships, you&apos;ll get the courier name, AWB number and tracking link by {channels()}.</p>
    <h2>Failed delivery</h2><p>If delivery fails because of an incorrect address or if the recipient is unavailable, please contact us {contactLine(s)}.</p>
  </> },
  "returns-policy": { title: "Returns & refunds", body: (s) => <>
    <h2>Return window</h2><p>You can request a return within {s.returnWindowDays} days of delivery from your order page. Items marked as non-returnable on the product page can&apos;t be returned. For hygiene reasons this usually includes briefs, trunks and women&apos;s innerwear, unless they arrive damaged or wrong.</p>
    <h2>Condition</h2><p>For hygiene reasons, items must be unused, unwashed and in their original packaging.</p>
    <h2>Damaged or wrong item</h2><p>If you received something damaged or incorrect, contact us {contactLine(s)} within 48 hours of delivery, with photos if possible.</p>
    <h2>Refunds</h2><p>After we receive and check the return, refunds go to your original payment method. Banks usually take 5–7 working days to show the amount.{s.codEnabled ? " For cash on delivery orders, we'll ask for your UPI or bank details." : ""}</p>
    <h2>Cancellations</h2><p>You can cancel from your order page until it has been packed. Prepaid cancellations are refunded in full.</p>
  </> },
  "privacy-policy": { title: "Privacy policy", body: (s) => <>
    <p>This policy explains how {s.legalName || s.storeName} handles your information.</p>
    <h2>What we collect</h2><p>Your name, contact details and delivery address when you order; order history; and basic data on how you found us (such as a link from Instagram or WhatsApp).</p>
    <h2>Payments</h2><p>Online payments are processed by Razorpay. We never see or store your card, UPI or banking credentials.</p>
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
  const { slug } = await params;
  const p = PAGES[slug];
  return p ? { title: p.title, alternates: { canonical: `/info/${slug}` } } : {};
}
export default async function InfoPage({ params }: Props) {
  const { slug } = await params;
  const p = PAGES[slug];
  if (!p) notFound();
  const s = await getSettings();
  return (
    <div className="container-x py-8">
      <article className="mx-auto max-w-2xl">
        {slug === "faq" && <JsonLd data={faqPage(faqItems(s))} />}
        <h1 className="text-4xl sm:text-5xl">{p.title}</h1>
        <div className="prose-vv mt-5">{p.body(s)}</div>
      </article>
    </div>
  );
}
