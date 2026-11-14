/** Enter an AWB, get the link. If a courier changes its URL, the seller can paste one in the order. */
export const COURIERS: { name: string; url?: (awb: string) => string }[] = [
  { name: "Delhivery", url: (a) => `https://www.delhivery.com/track-v2/package/${encodeURIComponent(a)}` },
  { name: "Shiprocket", url: (a) => `https://shiprocket.co/tracking/${encodeURIComponent(a)}` },
  { name: "Xpressbees", url: (a) => `https://www.xpressbees.com/shipment/tracking?awbNo=${encodeURIComponent(a)}` },
  { name: "Ekart", url: (a) => `https://ekartlogistics.com/shipmenttrack/${encodeURIComponent(a)}` },
  { name: "Blue Dart" },
  { name: "DTDC" },
  { name: "India Post" },
  { name: "Other" },
];
export function courierLink(name: string | null | undefined, awb: string | null | undefined) {
  if (!name || !awb) return null;
  return COURIERS.find((c) => c.name === name)?.url?.(awb) ?? null;
}
