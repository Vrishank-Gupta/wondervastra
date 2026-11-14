/** One line describing how a buyer can pay for an item. Pure, so browser components can use it too. */
export function paymentLine(online: boolean, cod: boolean) {
  if (online && cod) return "UPI, cards & cash on delivery available";
  if (online) return "Prepaid only: UPI, cards & netbanking";
  if (cod) return "Cash on delivery available";
  return "Online payment opening soon";
}
