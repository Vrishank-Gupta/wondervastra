/**
 * Who runs the store, in one place: the Contact, About and Terms pages, the footer and the structured data
 * all read from here, so they never disagree. Google Merchant Center's misrepresentation check looks for a
 * named business, a physical address and a way to call, on the site itself.
 */
import type { StoreSettings } from "./settings";

/** "+91 88008 35800" for a 10-digit Indian number; anything else is shown as typed. */
export function phoneDisplay(n: string) {
  const d = n.replace(/\D/g, "").replace(/^(?:91|0)(?=[6-9]\d{9}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : n.trim();
}
/** "+918800835800", for tel: links and schema.org. */
export function phoneE164(n: string) {
  const d = n.replace(/\D/g, "").replace(/^(?:91|0)(?=[6-9]\d{9}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : n.replace(/[^\d+]/g, "");
}

export function business(s: StoreSettings) {
  const address = s.businessAddress.trim().replace(/\s*\n\s*/g, ", ");
  // The owner doesn't want the street address on the site: only the city/state. Invoices still print it in full.
  const place = /delhi/i.test(address) || /delhi/i.test(s.businessState) ? "Delhi" : s.businessState || null;
  return {
    name: s.legalName.trim() || s.storeName,
    /** "WonderVastra is run by X" only when the registered name differs from the shop name. */
    tradingAs: s.legalName.trim() && s.legalName.trim().toLowerCase() !== s.storeName.toLowerCase() ? s.storeName : null,
    /** Where the business is, as shown publicly: "Delhi". */
    address: place,
    state: s.businessState || null,
    phone: s.whatsappNumber.trim() ? phoneDisplay(s.whatsappNumber) : null,
    tel: s.whatsappNumber.trim() ? phoneE164(s.whatsappNumber) : null,
    email: s.supportEmail || null,
    hours: s.supportHours || null,
    gstin: s.gstin || null,
    grievanceOfficer: s.grievanceOfficer?.trim() || null,
  };
}

/** schema.org PostalAddress, or undefined when no address is saved. */
export function postalAddress(s: StoreSettings) {
  const b = business(s);
  if (!b.address) return undefined;
  return { "@type": "PostalAddress", addressLocality: b.address, ...(b.state ? { addressRegion: b.state } : {}), addressCountry: "IN" };
}
