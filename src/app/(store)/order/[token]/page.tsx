import { emailConfigured, whatsappConfigured } from "@/lib/notifications";
import { WhatsAppGroupBand } from "@/components/store/whatsapp-group";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartyPopper } from "lucide-react";
import { OrderActions, ReturnPanel } from "@/components/store/order-actions-ui";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { OrderBody } from "@/components/store/order-view";
import { formatDate, STATUS_LABEL } from "@/lib/format";
import { orderBundleByToken, returnWindow } from "@/lib/order-access";
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
  const win = await returnWindow(order);
  const [request] = await db.select().from(schema.returnRequests).where(eq(schema.returnRequests.orderId, order.id)).orderBy(desc(schema.returnRequests.createdAt)).limit(1);
  const prods = items.length ? await db.select({ id: schema.products.id, returnable: schema.products.returnable }).from(schema.products).where(inArray(schema.products.id, items.map((i) => i.productId))) : [];
  const closed = order.status === "cancelled" || order.status === "pending_payment";
  const sentTo = [emailConfigured() && order.email, whatsappConfigured() && order.whatsappOptIn && "your WhatsApp"].filter(Boolean) as string[];
  const fb = closed ? null : order.deliveredAt && settings.deliveryFeedbackEnabled ? "delivery" : order.placedAt && settings.orderFeedbackEnabled ? "order" : null;
  return (
    <div className="container-x py-6">
      {placed && <CartResetOnPlaced orderNumber={order.number} />}
      {placed && order.status !== "pending_payment" && (
        <div className="pop-in mb-5 flex items-start gap-3 rounded-sm border border-line bg-pine-soft p-4">
          <PartyPopper aria-hidden className="shrink-0" />
          <div>
            <p className="font-display text-2xl">Your order is confirmed.</p>
            <p className="text-sm">{sentTo.length ? <>We&apos;ve sent the details to {sentTo.join(" and ")}. </> : null}Bookmark this page to track it anytime.</p>
          </div>
        </div>
      )}
      {placed && order.status !== "pending_payment" && <WhatsAppGroupBand url={settings.whatsappGroupUrl} compact />}
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
        <>
          <ReturnPanel token={order.accessToken} status={order.status} deliveredAt={order.deliveredAt} closesAt={win.closesAt} open={win.open} days={win.days}
            items={items.map((i) => ({ id: i.id, name: i.name, label: i.variantLabel, qty: i.qty, image: i.image, returnable: Boolean(prods.find((p) => p.id === i.productId)?.returnable) }))}
            request={request ? { status: request.status, reason: request.reason, details: request.details, adminNote: request.adminNote, photos: request.photos, items: request.items, pickupAwb: request.pickupAwb, pickupStatus: request.pickupStatus, createdAt: request.createdAt } : null} />
          <OrderActions token={order.accessToken} canCancel={order.status === "confirmed"} feedbackType={fb} />
        </>
      } />
    </div>
  );
}
