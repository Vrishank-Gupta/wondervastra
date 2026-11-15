/** The one thing to do next on an order, in plain words, for the order list and the order page. */
type O = { status: string; awb: string | null; courier: string | null; paymentStatus: string; paymentMethod: string; total: number; refundedTotal: number; courierStatus: string | null };
export type NextStep = { label: string; tone: "act" | "wait" | "done"; detail?: string; anchor?: string };

export function nextStep(o: O, ret?: { status: string } | null): NextStep {
  const paid = o.paymentStatus === "paid" || o.paymentStatus === "partially_refunded";
  const owed = paid && o.refundedTotal < o.total;
  if (ret?.status === "requested") return { label: "Review return", tone: "act", detail: "The customer sent photos and a reason. Approve to book the pickup, or reject with a reason.", anchor: "return" };
  if (ret?.status === "approved" || ret?.status === "picked_up") return { label: "Return on its way", tone: "wait", detail: "When it arrives, check the items and mark it received.", anchor: "return" };
  if (ret?.status === "received" && owed) return { label: "Send refund", tone: "act", detail: "The return is checked in. Send the refund.", anchor: "return" };
  switch (o.status) {
    case "pending_payment": return { label: "Awaiting payment", tone: "wait", detail: "Nothing to do. Unpaid checkouts cancel themselves." };
    case "confirmed":
    case "packed":
      if (!o.awb) return { label: "Book shipment", tone: "act", detail: "Pack the items, then book the shipment.", anchor: "delhivery" };
      if (o.courier === "Delhivery") return { label: "Label & pickup", tone: "act", detail: "Print the label, stick it on the parcel, and request a pickup if you haven't.", anchor: "delhivery" };
      return { label: "Mark shipped", tone: "act", detail: "Mark the order shipped once the courier collects it." };
    case "shipped": return { label: "In transit", tone: "wait", detail: o.courierStatus ? `Latest: ${o.courierStatus}` : "Tracking updates by itself." };
    case "out_for_delivery": return { label: "Out for delivery", tone: "wait", detail: o.courierStatus ?? undefined };
    case "delivered": return { label: "Delivered", tone: "done" };
    case "return_requested": return { label: "Review return", tone: "act", anchor: "return" };
    case "returned": return owed ? { label: "Send refund", tone: "act", anchor: "return" } : { label: "Returned", tone: "done" };
    case "cancelled": return owed && o.paymentMethod === "razorpay" ? { label: "Refund due", tone: "act", detail: "This paid order was cancelled. Send the refund." } : { label: "Cancelled", tone: "done" };
    default: return { label: o.status, tone: "wait" };
  }
}
