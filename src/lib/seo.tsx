/**
 * Structured data (schema.org JSON-LD) that search engines and AI assistants read to understand the store:
 * who sells (Organization / OnlineStore), what (Product, ItemList), where pages sit (BreadcrumbList),
 * and common questions (FAQPage). Keep it truthful: it must match what the page shows.
 */
import type { StoreSettings } from "./settings";
import { siteUrl, withBrand } from "./utils";
import { areaLabel, parsePincodes, splitArea } from "./delivery-area";

export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const abs = (path: string) => (path.startsWith("http") ? path : `${siteUrl()}${path.startsWith("/") ? "" : "/"}${path}`);

/** "Lux, Rupa and Amul" from the brands that actually have live listings; never names a brand we don't sell. */
export function brandPhrase(names: string[]) {
  if (!names.length) return "top brands";
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
/** "Delhi NCR (Delhi, Gurugram, Noida, Ghaziabad and Faridabad)" for the default list, else the area name. */
export function areaPhrase(s: Pick<StoreSettings, "deliveryAreaName" | "deliveryPincodes">) {
  const a = areaLabel(s);
  if (a === "India") return a;
  // Lists only the towns actually ticked in Settings, so the wording never promises more than the pincode list.
  const towns = splitArea(s.deliveryPincodes).towns.map((t) => t.replace(" & ", ", "));
  return towns.length ? `${a} (${brandPhrase(towns)})` : a;
}
export function seoDescription(brandNames: string[], s: Pick<StoreSettings, "deliveryAreaName" | "deliveryPincodes">) {
  return `WonderVastra is an online store for 100% original branded thermal wear at the lowest prices: kids' thermals for ages 2 to 11 and men's thermals, from ${brandPhrase(brandNames)}. Delivering across ${areaPhrase(s)}.`;
}
/** Where we deliver, as schema.org understands it. */
function served(s: StoreSettings) {
  if (!s.deliveryPincodes.trim()) return { "@type": "Country", name: "India" };
  return { "@type": "Place", name: areaLabel(s), address: { "@type": "PostalAddress", addressCountry: "IN" } };
}

export function organization(s: StoreSettings, brandNames: string[] = []) {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${siteUrl()}/#store`,
    name: s.storeName,
    legalName: s.legalName || undefined,
    url: siteUrl(),
    logo: abs("/brand/wondervastra-avatar-1080.png"),
    image: abs("/brand/wondervastra-logo.png"),
    slogan: "Crafted with trust",
    description: seoDescription(brandNames, s),
    email: s.supportEmail || undefined,
    areaServed: served(s),
    currenciesAccepted: "INR",
    sameAs: [s.instagramUrl, s.facebookUrl].filter(Boolean),
    contactPoint: s.supportEmail ? [{ "@type": "ContactPoint", contactType: "customer support", email: s.supportEmail, url: `${siteUrl()}/info/contact`, areaServed: "IN", availableLanguage: ["English", "Hindi"] }] : undefined,
    hasMerchantReturnPolicy: returnPolicy(s),
  };
}

export function website(s: StoreSettings) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    name: s.storeName,
    url: siteUrl(),
    inLanguage: "en-IN",
    publisher: { "@id": `${siteUrl()}/#store` },
    // Lets Google show a search box for the store in results.
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${siteUrl()}/shop?q={search_term_string}` }, "query-input": "required name=search_term_string" },
  };
}

export function returnPolicy(s: StoreSettings) {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "IN",
    returnPolicyCategory: s.returnWindowDays > 0 ? "https://schema.org/MerchantReturnFiniteReturnWindow" : "https://schema.org/MerchantReturnNotPermitted",
    merchantReturnDays: s.returnWindowDays || undefined,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/FreeReturn",
  };
}

export function shippingDetails(s: StoreSettings, charge: number) {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: (charge / 100).toFixed(2), currency: "INR" },
    shippingDestination: s.deliveryPincodes.trim()
      ? parsePincodes(s.deliveryPincodes).rules.slice(0, 20).map((r) => ({ "@type": "DefinedRegion", addressCountry: "IN", postalCodeRange: { postalCodeBegin: String(r.from), postalCodeEnd: String(r.to) } }))
      : { "@type": "DefinedRegion", addressCountry: "IN" },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: s.dispatchDays, unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: s.deliveryDaysMin, maxValue: s.deliveryDaysMax, unitCode: "DAY" },
    },
  };
}

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

export function itemList(name: string, products: { name: string; slug: string; brandName: string | null }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 50).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/p/${p.slug}`), name: withBrand(p.name, p.brandName) })),
  };
}

export function faqPage(qa: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })),
  };
}
