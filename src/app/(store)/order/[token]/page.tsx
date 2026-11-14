import { emailConfigured, whatsappConfigured } from "@/lib/notifications";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartyPopper } from "lucide-react";
import { OrderActions } from "@/components/store/order-actions-ui";
import { OrderBody } from "@/components/store/order-view";
import { formatDate, STATUS_LABEL } from "@/lib/format";
import { orderBundleByToken, returnEligible } from "@/lib/order-access";
import { CartResetOnPlaced } from "@/components/store/cart-reset";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { token } = await params;
  const { placed } = await searchParams;
  const data = await orderBundleByToken(token);
  if (!data) notFound();
  const { order, items, events } = data;
  const settings = await getSettings();
  const canReturn = await returnEligible(order, items);
  const closed = order.status === "cancelled" || order.status === "pending_payment";
  const sentTo = [emailConfigured() && order.email, whatsappConfigured() && order.whatsappOptIn && "your WhatsApp"].filter(Boolean) as string[];
  const fb = closed ? null : order.deliveredAt && settings.deliveryFeedbackEnabled ? "delivery" : order.placedAt && settings.orderFeedbackEnabled ? "order" : null;
  return (
    <div className="container-x py-6">
      {placed && <CartResetOnPlaced />}
      {placed && order.status !== "pending_payment" && (
        <div className="pop-in mb-5 flex items-start gap-3 rounded-sm border border-line bg-pine-soft p-4">
          <PartyPopper aria-hidden className="shrink-0" />
          <div>
            <p className="font-display text-2xl">Your order is confirmed.</p>
            <p className="text-sm">{sentTo.length ? <>We&apos;ve sent the details to {sentTo.join(" and ")}. </> : null}Bookmark this page to track it anytime.</p>
          </div>
        </div>
      )}
      {placed && order.status === "pending_payment" && (
        <div className="mb-5 rounded-sm border border-line bg-sand-soft p-4 font-medium">We&apos;re confirming your payment. This page will update shortly; refresh in a minute.</div>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink-soft">Order placed {formatDate(order.placedAt ?? order.createdAt)}</p>
          <h1 className="text-4xl">{order.number}</h1>
        </div>
        <span className="sticker bg-sand-soft px-3 py-1 text-sm">{STATUS_LABEL[order.status]}</span>
      </div>
      <OrderBody order={order} items={items} events={events} actions={
        <OrderActions token={order.accessToken} canCancel={order.status === "confirmed"} canReturn={canReturn} feedbackType={fb} />
      } />
    </div>
  );
}
