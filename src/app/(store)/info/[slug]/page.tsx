import { ContactForm } from "@/components/store/contact-form";
import { BusinessDetails } from "@/components/store/business-details";
import { business } from "@/lib/business";
import { getActiveBrands } from "@/lib/catalog";
import { abs, areaPhrase, brandPhrase, breadcrumbs, faqPage, JsonLd, organization } from "@/lib/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings, type StoreSettings } from "@/lib/settings";
import { capabilities } from "@/lib/capabilities";

/** "email and WhatsApp" only when both are really connected. */
const channels = () => (capabilities().whatsapp ? "email and WhatsApp" : "email");

/** Live facts the pages quote, so they never name a brand the store doesn't sell. */
type Ctx = { brands: string[] };
type Page = { title: string; body: (s: StoreSettings, c: Ctx) => React.ReactNode };

const DESCRIPTIONS: Record<string, string> = {
  about: "Who runs WonderVastra, where we are, and how we work: original Amul, Dollar and Lux thermal wear for kids and men, bought direct from the brands and delivered free across Delhi NCR.",
  contact: "Contact WonderVastra by phone, WhatsApp, email or the contact form. Our business name, address and hours.",
  faq: "Answers about sizes, delivery across Delhi NCR, free delivery, payments, returns and tracking at WonderVastra.",
  "shipping-policy": "Free delivery on every order across Delhi NCR, usually in 3–5 days, with live tracking.",
  "returns-policy": "Return unused thermals within 3 days of delivery. Free pickup once approved, refund to your original payment method.",
  "privacy-policy": "How WonderVastra collects, uses and protects your personal information.",
  terms: "Terms for shopping at WonderVastra: who sells, how prices and MRP work, payment, delivery, returns and how to raise a complaint.",
};

const contactLine = (s: StoreSettings) => s.supportEmail ? `at ${s.supportEmail}` : "through our contact page";

/** One source for the FAQ page and its FAQPage search data, so both always say the same thing. */
function faqItems(s: StoreSettings, c: Ctx): { q: string; a: string }[] {
  const online = capabilities().onlinePayments;
  const b = business(s);
  const brands = c.brands.length ? brandPhrase(c.brands) : "the brands";
  return [
    { q: "Are your products original?", a: `Yes. We buy every product directly from ${brands} and sell it new, in the brand's own packaging with the MRP printed on it. Never copies or seconds. ${s.storeName} is an independent retailer: we're not owned by or part of these brands.` },
    { q: "Why are your prices below MRP?", a: "MRP is the highest price a brand allows any shop to charge, and shops may sell below it. We buy directly from the brands and sell online only, so every product is priced below its MRP. Each product page shows our price next to the MRP." },
    { q: `Who runs ${s.storeName}?`, a: `${s.storeName} is run by ${b.name}${b.address ? ` in ${b.address}` : ""}. You can reach us${b.phone ? ` on ${b.phone} (call or WhatsApp)` : ""}${b.email ? `${b.phone ? " or" : ""} at ${b.email}` : ""}${b.hours ? `, ${b.hours}` : ""}.` },
    { q: "Do I need an account to order?", a: "No. You can check out as a guest and track your order with the link we send you." },
    { q: "How do I pay?", a: online ? `UPI, cards, netbanking and wallets through Razorpay${s.codEnabled ? ", or cash on delivery on eligible items" : ""}.` : s.codEnabled ? "Cash on delivery on eligible items. Online payment (UPI and cards) is opening soon." : "Online payment is opening soon. Please contact us to order." },
    s.deliveryPincodes.trim()
      ? { q: "Where do you deliver?", a: `We deliver across ${areaPhrase(s)} for now. Enter your pincode on any product page to check. If we don't reach you yet, leave your number there and we'll tell you as soon as we do.` }
      : { q: "Do you deliver across India?", a: "Yes. We ship across India through trusted courier partners, and delivery is free on every order." },
    { q: "When will my order arrive?", a: `Usually within ${s.deliveryDaysMin}–${s.deliveryDaysMax} days of ordering. Enter your pincode on any product page or at checkout to see your delivery date, and we send a tracking link once it ships.` },
    { q: "What sizes do kids' thermals come in?", a: "Kids' warmers fit ages 2 to 11 years, in sizes 45 to 75 cm. Each listing shows the age with every size and has the brand's size guide. Kids' wear is sold in twos: mix any sizes, tops and trousers." },
    { q: "Is delivery free?", a: "Yes, on every order, with no minimum." },
    { q: "How do I track my order?", a: `We'll send you a tracking link by ${channels()} when it ships. You can also use the Track Order page anytime.` },
    { q: "Can I cancel my order?", a: "Yes, from your order page, until it has been packed." },
    { q: "Can I return an item?", a: `Yes, within ${s.returnWindowDays} days of delivery, if it's unused, unwashed and undamaged in its original packaging. Start the return from your order page with photos, and we'll pick it up for free once approved. See our returns policy.` },
    { q: "An item is sold out. Will it come back?", a: "Tap “Notify me” on the product page and we'll message you as soon as it's restocked." },
  ];
}

const PAGES: Record<string, Page> = {
  about: { title: "About us", body: (s, c) => { const b = business(s); const brands = c.brands.length ? brandPhrase(c.brands) : "trusted brands"; return <>
    <p>{s.storeName} is an online store for original branded thermal wear, run by {b.name}{b.address ? ` from ${b.address}` : ""}. We sell kids&apos; thermals for ages 2 to 11 and men&apos;s thermals in sizes S to XXL, from {brands}, and deliver them free across {areaPhrase(s)}.</p>
    <h2>Where our stock comes from</h2>
    <p>We buy every product directly from the brands. Each piece reaches you new and unused, in the brand&apos;s own packaging, with the brand&apos;s MRP printed on it. {s.storeName} is an independent retailer: we are not owned by or part of {brands}, and their names and logos belong to them.</p>
    <h2>How we price</h2>
    <p>Every product page shows our price next to the brand&apos;s MRP, and our price is always below it. Bigger carts get a further discount, applied automatically. Prices include all taxes, and delivery is free on every order.</p>
    <h2>What you can expect</h2>
    <ul>
      <li>A delivery date for your pincode before you pay, and a tracking link once the parcel ships</li>
      <li>Returns within {s.returnWindowDays} days of delivery for unused items, with a free pickup (<a href="/info/returns-policy">returns policy</a>)</li>
      <li>Help from a real person by {b.phone ? "phone, WhatsApp or " : ""}email{b.hours ? `, ${b.hours}` : ""}</li>
      <li>Brand size charts on every product, and <a href="/guides">buying guides</a> if you&apos;re unsure which size to pick</li>
    </ul>
    <h2>Business details</h2>
    <BusinessDetails settings={s} />
  </>; } },
  contact: { title: "Contact us", body: (s) => { const b = business(s); return <>
    <p>Questions about an order, sizes or a product? {b.phone ? <>Call or WhatsApp us on <a href={`tel:${b.tel}`}>{b.phone}</a>, email us, or send a message below.</> : <>Send us a message and we&apos;ll reply by email.</>}{b.hours ? ` We reply ${b.hours}.` : ""}</p>
    <BusinessDetails settings={s} />
    <h2>Send a message</h2>
    <ContactForm />
    {b.email && <p>If it&apos;s about an order, include the order number.</p>}
  </>; } },
  faq: { title: "FAQs", body: (s, c) => <>{faqItems(s, c).map((x) => <div key={x.q}><h2>{x.q}</h2><p>{x.a}</p></div>)}</> },
  "shipping-policy": { title: "Shipping policy", body: (s) => <>
    {s.deliveryPincodes.trim()
      ? <><h2>Where we deliver</h2><p>We deliver across {areaPhrase(s)} for now. Enter your pincode on any product page or at checkout to check. If we don&apos;t deliver to you yet, leave your number and we&apos;ll tell you when we do.</p></>
      : <p>We ship across India through trusted courier partners.</p>}
    <h2>Delivery time</h2><p>We pack and hand your order to the courier within {s.dispatchDays} working {s.dispatchDays === 1 ? "day" : "days"}. Orders usually arrive within {s.deliveryDaysMin}–{s.deliveryDaysMax} days of ordering. Enter your pincode on a product page or at checkout to see your delivery date. You get a tracking link as soon as your parcel ships.</p>
    <h2>Free delivery</h2><p>Every order ships free, whatever its size. There is no minimum order.{s.codEnabled && s.codFee > 0 ? ` Cash on delivery, where offered, has a handling fee of ₹${Math.round(s.codFee / 100)}, shown at checkout before you order.` : ""}</p>
    <h2>Tracking</h2><p>When your order ships, you&apos;ll get the courier name, AWB number and tracking link by {channels()}.</p>
    <h2>Failed delivery</h2><p>If delivery fails because of an incorrect address or if the recipient is unavailable, please contact us {contactLine(s)}.</p>
  </> },
  "returns-policy": { title: "Returns & refunds", body: (s) => <>
    <h2>Return window</h2><p>You can ask for a return within <b>{s.returnWindowDays} days of delivery</b>. The window opens when your parcel is delivered and your order page shows exactly when it closes.</p>
    <h2>What can be returned</h2><p>Only <b>unused, unwashed and undamaged</b> items, with their tags and in the original packaging. For hygiene reasons we can&apos;t accept thermals that have been worn or washed. Items marked non-returnable on the product page can&apos;t be returned.</p>
    <h2>How to return</h2><ol><li>Open your order page (from your order message or <a href="/track">Track order</a>) and tap <b>Start a return</b>.</li><li>Choose the items, pick a reason, and add 1 to 5 photos of the items, tags and packaging.</li><li>We review it within 1 working day. If it&apos;s approved, we book a free pickup from your address. If not, we tell you why.</li><li>Keep the items packed and ready for the courier.</li></ol>
    <h2>Damaged or wrong item</h2><p>If something arrives damaged or isn&apos;t what you ordered, start a return within {s.returnWindowDays} days with photos, or contact us {contactLine(s)}.</p>
    <h2>Refunds</h2><p>Once the items reach us and pass a quick check, we refund to your original payment method. Banks usually take 5–7 working days to show the amount.{s.codEnabled ? " For cash on delivery orders, we'll ask for your UPI or bank details." : ""}</p>
    <h2>Cancellations</h2><p>You can cancel from your order page until it has been packed. Prepaid cancellations are refunded in full.</p>
  </> },
  "privacy-policy": { title: "Privacy policy", body: (s) => <>
    <p>This policy explains how {s.legalName || s.storeName} handles your information.</p>
    <h2>What we collect</h2><p>Your name, contact details and delivery address when you order; order history; and basic data on how you found us (such as a link from Instagram or WhatsApp).</p>
    <h2>Payments</h2><p>Online payments are processed by Razorpay. We never see or store your card, UPI or banking credentials.</p>
    <h2>How we use it</h2><p>To fulfil your order, send order and delivery updates by email and WhatsApp, provide support, and improve our store. We share only what&apos;s needed with couriers and service providers that help us do this. We don&apos;t sell your data.</p>
    <h2>Your choices</h2><p>You can opt out of WhatsApp updates at checkout and ask us to access or delete your data by contacting us {contactLine(s)}.</p>
  </> },
  terms: { title: "Terms of use", body: (s, c) => { const b = business(s); const brands = c.brands.length ? brandPhrase(c.brands) : "the brands"; return <>
    <p>This website is run by {b.name}{b.tradingAs ? `, trading as ${b.tradingAs}` : ""}{b.address ? `, based in ${b.address}` : ""}. By using it and placing an order, you agree to these terms.</p>
    <h2>Products</h2><p>Everything we sell is new, original stock bought directly from the brands ({brands}), in the brand&apos;s own packaging. We are an independent retailer, not owned by or part of these brands, and their names and logos belong to them. Product details, fabric and size charts come from the brands. We try to show colours and details accurately, but your screen may vary slightly from the actual product.</p>
    <h2>Prices and MRP</h2><p>All prices are in Indian Rupees and include applicable taxes. MRP is the maximum retail price set by the brand and printed on the pack. The &ldquo;% off&rdquo; shown on a product is the difference between our price and that MRP. Cart offers are applied automatically at checkout and shown before you pay. If a price was clearly listed in error or an item is unavailable, we may cancel the order and refund you in full.</p>
    <h2>Orders and payment</h2><p>You get an order confirmation and a tracking link once you place an order. {capabilities().onlinePayments ? "Online payments are processed securely by Razorpay; we never see or store your card, UPI or bank details." : ""}{s.codEnabled ? " Cash on delivery is available on eligible orders." : ""} You can cancel from your order page until the order has been packed.</p>
    <h2>Delivery and returns</h2><p>See our <a href="/info/shipping-policy">shipping policy</a> and <a href="/info/returns-policy">returns and refunds policy</a>. Unused items can be returned within {s.returnWindowDays} days of delivery.</p>
    <h2>Offers</h2><p>Sales and coupons are valid for the stated period and conditions. Per-order and per-customer quantity limits may apply.</p>
    <h2>Complaints and grievances</h2><p>If something went wrong, contact {b.grievanceOfficer ? <>our grievance officer, <b>{b.grievanceOfficer}</b>,</> : "us"} {b.email ? <>at <a href={`mailto:${b.email}`}>{b.email}</a></> : "through our contact page"}{b.phone ? <> or on {b.phone}</> : null}. We acknowledge every complaint within 48 hours and resolve it within one month, as required by the Consumer Protection (E-Commerce) Rules, 2020.</p>
    <h2>Governing law</h2><p>These terms are governed by the laws of India.</p>
    <h2>Business details</h2>
    <BusinessDetails settings={s} />
  </>; } },
};

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = PAGES[slug];
  return p ? { title: p.title, description: DESCRIPTIONS[slug], alternates: { canonical: `/info/${slug}`, types: { "text/markdown": `/info/${slug}.md` } } } : {};
}
export default async function InfoPage({ params }: Props) {
  const { slug } = await params;
  const p = PAGES[slug];
  if (!p) notFound();
  const [s, brands] = await Promise.all([getSettings(), getActiveBrands()]);
  const c: Ctx = { brands: brands.filter((b) => !b.isHouse).map((b) => b.name) };
  const kind = slug === "about" ? "AboutPage" : slug === "contact" ? "ContactPage" : slug === "faq" ? null : "WebPage";
  return (
    <div className="container-x py-8">
      <article className="mx-auto max-w-2xl">
        <JsonLd data={[
          breadcrumbs([{ name: "Home", path: "/" }, { name: p.title, path: `/info/${slug}` }]),
          ...(slug === "faq" ? [faqPage(faqItems(s, c))] : []),
          ...(kind ? [{ "@context": "https://schema.org", "@type": kind, name: p.title, url: abs(`/info/${slug}`), description: DESCRIPTIONS[slug], ...(kind === "WebPage" ? { isPartOf: { "@id": abs("/#website") } } : { about: { "@id": abs("/#store") }, mainEntity: { "@id": abs("/#store") } }) }] : []),
          ...(slug === "about" || slug === "contact" ? [organization(s, c.brands)] : []),
        ]} />
        <h1 className="text-4xl sm:text-5xl">{p.title}</h1>
        <div className="prose-vv mt-5">{p.body(s, c)}</div>
      </article>
    </div>
  );
}
