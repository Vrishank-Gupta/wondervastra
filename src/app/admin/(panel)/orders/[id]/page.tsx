import { capabilities } from "@/lib/capabilities";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { ArrowLeft, ExternalLink, FileText, MessageCircle, Phone } from "lucide-react";
import { db, schema } from "@/db";
import { OrderManager } from "@/components/admin/order-manager";
import { DelhiveryPanel } from "@/components/admin/delhivery-panel";
import { delhiveryConfigured } from "@/lib/delhivery";
import { DELHIVERY, quoteShipment, shippingReady } from "@/lib/shipping";
import { Panel, PayBadge, StatusBadge } from "@/components/admin/ui";
import { formatDateTime, money, PAYMENT_LABEL } from "@/lib/format";
import { buildOrderMessage, trackingLink, whatsappChatLink, type OrderEventName } from "@/lib/notifications";
import { TRANSITIONS } from "@/lib/orders";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Order" };

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!o) notFound();
  const [items, events, notifs, feedback, returns, s, others] = await Promise.all([
    db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id)),
    db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, id)).orderBy(desc(schema.orderEvents.createdAt)),
    db.select().from(schema.notifications).where(eq(schema.notifications.orderId, id)).orderBy(desc(schema.notifications.createdAt)),
    db.select().from(schema.feedback).where(eq(schema.feedback.orderId, id)),
    db.select().from(schema.returnRequests).where(eq(schema.returnRequests.orderId, id)),
    getSettings(),
    db.select({ id: schema.orders.id }).from(schema.orders).where(and(or(eq(schema.orders.phone, o.phone), eq(schema.orders.email, o.email)), ne(schema.orders.id, id), ne(schema.orders.status, "pending_payment"))),
  ]);

  // One-tap manual messages, so nothing is blocked before the WhatsApp API is approved.
  const opts = { orderFeedback: s.orderFeedbackEnabled, deliveryFeedback: s.deliveryFeedbackEnabled };
  const quick: { label: string; event: OrderEventName }[] = [
    { label: "Order confirmed", event: "order_placed" },
    ...(o.awb || o.trackingUrl ? [{ label: "Shipped + tracking", event: "order_shipped" as const }] : []),
    { label: "Out for delivery", event: "out_for_delivery" },
    { label: "Delivered + feedback", event: "order_delivered" },
  ];
  const attention = events.filter((e) => e.type === "attention");

  return (
    <>
      <Link href="/admin/orders" className="mb-2 inline-flex items-center gap-1 text-sm font-medium no-print"><ArrowLeft size={15} aria-hidden /> Orders</Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-2xl">{o.number}</h1><StatusBadge status={o.status} /><PayBadge status={o.paymentStatus} method={o.paymentMethod} />
        <span className="text-sm text-ink-soft">{formatDateTime(o.createdAt)}</span>
        <div className="ml-auto flex gap-2">
          <Link className="btn btn-white btn-sm" href={`/admin/orders/${o.id}/invoice`} target="_blank"><FileText size={15} aria-hidden /> Invoice & slip</Link>
          <a className="btn btn-white btn-sm" href={trackingLink(o)} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden /> Buyer view</a>
        </div>
      </div>
      {attention.map((e) => <p key={e.id} className="mb-3 rounded-sm border border-clay bg-clay-soft p-3 text-sm font-medium" role="alert">{e.message}</p>)}
      {o.status === "cancelled" && o.paymentStatus === "paid" && <p className="mb-3 rounded-sm border border-clay bg-clay-soft p-3 text-sm font-medium" role="alert">This order is cancelled but paid. Issue the refund below.</p>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-5 xl:col-span-2">
          {delhiveryConfigured() && !["pending_payment", "cancelled"].includes(o.status) && (!o.courier || o.courier === DELHIVERY) && (
            <DelhiveryPanel
              orderId={o.id} status={o.status} ready={shippingReady(s)}
              booked={o.awb && o.courier === DELHIVERY ? { awb: o.awb, trackingUrl: o.trackingUrl, courierStatus: o.courierStatus, statusAt: o.courierStatusAt, etaAt: o.etaAt, cost: o.shippingCost } : null}
              quote={!o.awb && shippingReady(s) && ["confirmed", "packed"].includes(o.status) ? await quoteShipment(o.id).catch(() => null) : null}
            />
          )}
          <OrderManager
            order={{ id: o.id, status: o.status, courier: o.courier, awb: o.awb, trackingUrl: o.trackingUrl, total: o.total, refundedTotal: o.refundedTotal, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod }}
            nextStatuses={TRANSITIONS[o.status]}
            notifyVia={[capabilities().email && "email", capabilities().whatsapp && o.whatsappOptIn && "WhatsApp"].filter(Boolean).join(" and ")}
          />
          <Panel title={`Items (${items.reduce((a, i) => a + i.qty, 0)} pcs)`}>
            <ul className="divide-y divide-ink/10">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded border border-line">{i.image && <Image src={i.image} alt="" fill sizes="44px" className="object-cover" />}</span>
                  <span className="min-w-0 flex-1"><Link href={`/admin/products/${i.productId}`} className="font-medium hover:underline">{i.name}</Link><span className="block text-xs text-ink-soft">{i.variantLabel}{i.sku ? ` · ${i.sku}` : ""}{i.saleName ? ` · ${i.saleName}` : ""}</span></span>
                  <span className="text-xs">{money(i.unitPrice)} × {i.qty}</span><b>{money(i.unitPrice * i.qty)}</b>
                </li>
              ))}
            </ul>
            <dl className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(o.subtotal)}</dd></div>
              {o.offerDiscount > 0 && <div className="flex justify-between"><dt>{o.offerName}</dt><dd>−{money(o.offerDiscount)}</dd></div>}
              {o.couponDiscount > 0 && <div className="flex justify-between"><dt>Coupon {o.couponCode}</dt><dd>−{money(o.couponDiscount)}</dd></div>}
              <div className="flex justify-between"><dt>Delivery {o.shippingNote && <span className="text-xs text-ink-soft">({o.shippingNote})</span>}</dt><dd>{o.shippingTotal ? money(o.shippingTotal) : "FREE"}</dd></div>
              {o.codFee > 0 && <div className="flex justify-between"><dt>COD fee</dt><dd>{money(o.codFee)}</dd></div>}
              <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{money(o.total)}</dd></div>
              {o.refundedTotal > 0 && <div className="flex justify-between font-medium text-clay"><dt>Refunded</dt><dd>{money(o.refundedTotal)}</dd></div>}
            </dl>
          </Panel>
          <Panel title="Full history">
            <ol className="space-y-2.5">
              {events.map((e) => (
                <li key={e.id} className="flex gap-2 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-ink" aria-hidden />
                  <div><p>{e.message}{!e.public && <span className="ml-1.5 rounded bg-line px-1 text-[10px] font-medium">internal</span>}</p><p className="text-xs text-ink-soft">{formatDateTime(e.createdAt)} · {e.actor}</p></div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel title="Customer">
            <p className="text-sm font-medium">{o.name}</p>
            <p className="text-sm">{o.email}</p>
            <p className="mb-2 text-sm">{o.phone}</p>
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-white btn-sm" href={`tel:+91${o.phone}`}><Phone size={14} aria-hidden /> Call</a>
              <a className="btn btn-white btn-sm" href={whatsappChatLink(o.phone, `Hi ${o.name.split(" ")[0]}, this is WonderVastra about your order ${o.number}.`)} target="_blank" rel="noreferrer"><MessageCircle size={14} aria-hidden /> Chat</a>
            </div>
            {others.length > 0 && <p className="mt-2 text-xs font-medium">Repeat buyer: {others.length} other order(s)</p>}
            {!o.whatsappOptIn && <p className="mt-2 text-xs font-medium text-clay">Opted out of WhatsApp updates</p>}
            <h3 className="mt-3 font-sans text-sm font-semibold tracking-normal">Ship to</h3>
            <p className="text-sm select-all">{o.name}<br />{o.line1}{o.line2 ? `, ${o.line2}` : ""}<br />{o.city}, {o.state} {o.pincode}<br />{o.phone}</p>
            {o.customerNote && <p className="mt-2 rounded-sm bg-sand-soft p-2 text-sm"><b>Note:</b> {o.customerNote}</p>}
            <p className="mt-2 text-xs text-ink-soft">Came from: <b className="capitalize">{o.utmSource ?? "direct"}</b>{o.utmCampaign ? ` / ${o.utmCampaign}` : ""}</p>
          </Panel>
          {returns.length > 0 && <Panel title="Return request">{returns.map((r) => <p key={r.id} className="text-sm"><b>{r.reason}</b>{r.details ? `: ${r.details}` : ""}<span className="block text-xs text-ink-soft">{formatDateTime(r.createdAt)}</span></p>)}</Panel>}
          <Panel title="Payment">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2"><dt>Method</dt><dd className="font-medium">{o.paymentMethod === "cod" ? "Cash on delivery" : "Razorpay"}</dd></div>
              <div className="flex justify-between gap-2"><dt>Status</dt><dd className="font-medium">{PAYMENT_LABEL[o.paymentStatus]}</dd></div>
              {o.razorpayPaymentId && <div><dt className="text-xs text-ink-soft">Payment ID</dt><dd className="font-mono text-xs break-all">{o.razorpayPaymentId}</dd></div>}
              {o.razorpayOrderId && <div><dt className="text-xs text-ink-soft">Razorpay order</dt><dd className="font-mono text-xs break-all">{o.razorpayOrderId}</dd></div>}
            </dl>
          </Panel>
          <Panel title="Send on WhatsApp">
            <p className="mb-2 text-xs text-ink-soft">Opens WhatsApp with the message ready to send.</p>
            <div className="flex flex-wrap gap-1.5">
              {quick.map((q) => <a key={q.event} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium hover:bg-pine-soft" target="_blank" rel="noreferrer" href={whatsappChatLink(o.phone, buildOrderMessage(q.event, o, opts).text)}>{q.label}</a>)}
            </div>
          </Panel>
          <Panel title="Messages sent">
            {notifs.length ? (
              <ul className="space-y-1.5 text-xs">
                {notifs.map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-2"><span><b className="capitalize">{n.channel}</b> · {n.event.replace(/_/g, " ")}<span className="block text-ink-soft">{formatDateTime(n.createdAt)}</span></span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-medium ${n.status === "sent" ? "bg-pine-soft" : n.status === "failed" ? "bg-clay-soft" : "bg-line"}`}>{n.status === "not_configured" ? "not connected" : n.status}</span></li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-soft">None yet.</p>}
          </Panel>
          {feedback.length > 0 && <Panel title="Customer feedback">{feedback.map((f) => <p key={f.id} className="text-sm"><b className="capitalize">{f.type}: {f.rating}★</b>{f.comment ? ` ${f.comment}` : ""}</p>)}</Panel>}
        </div>
      </div>
    </>
  );
}
