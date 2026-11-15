import Image from "next/image";
import Link from "next/link";
import { Check, CircleX, ExternalLink, MapPin, Package, PackageCheck, Truck, Bike, RotateCcw } from "lucide-react";
import type { schema } from "@/db";
import { formatDate, formatDateTime, money, PAYMENT_LABEL, STATUS_LABEL } from "@/lib/format";

type Order = typeof schema.orders.$inferSelect;
type Item = typeof schema.orderItems.$inferSelect;
type Ev = typeof schema.orderEvents.$inferSelect;

const STEPS = [
  { key: "confirmed", label: "Confirmed", icon: Check },
  { key: "packed", label: "Packed", icon: Package },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "out_for_delivery", label: "Out for delivery", icon: Bike },
  { key: "delivered", label: "Delivered", icon: PackageCheck },
];

export function Tracker({ order }: { order: Order }) {
  const offTrack = ["cancelled", "returned", "return_requested", "pending_payment"].includes(order.status);
  if (offTrack) {
    const Icon = order.status === "cancelled" ? CircleX : RotateCcw;
    return (
      <div className="flex items-center gap-3 rounded-sm border border-line bg-clay-soft p-4">
        <Icon aria-hidden />
        <p className="font-semibold">{STATUS_LABEL[order.status]}</p>
      </div>
    );
  }
  const current = STEPS.findIndex((s) => s.key === order.status);
  return (
    <ol className="flex" aria-label={`Order status: ${STATUS_LABEL[order.status]}`}>
      {STEPS.map((s, i) => {
        const done = i <= current;
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center text-center" aria-current={i === current ? "step" : undefined}>
            {i > 0 && <span className={`absolute top-[18px] right-1/2 h-1 w-full ${i <= current ? "bg-ink" : "bg-ink/15"}`} aria-hidden />}
            <span className={`relative grid size-10 place-items-center rounded-full border ${done ? "border-ink bg-sand" : "border-line bg-white text-ink/30"} ${i === current ? "" : ""}`}><s.icon size={17} aria-hidden /></span>
            <span className={`mt-1.5 text-[11px] leading-tight font-medium sm:text-xs ${done ? "" : "text-ink/40"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ShipmentCard({ order }: { order: Order }) {
  const live = ["confirmed", "packed", "shipped", "out_for_delivery"].includes(order.status);
  const eta = live && order.etaAt ? new Date(order.etaAt).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) : null;
  const delivered = order.deliveredAt && ["delivered", "return_requested", "returned"].includes(order.status) ? new Date(order.deliveredAt).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) : null;
  if (!order.awb && !order.trackingUrl && !eta && !delivered) return null;
  return (
    <div className="rounded-sm border border-line bg-slate-soft p-4" data-testid="shipment">
      <p className="flex items-center gap-2 font-semibold"><Truck size={18} aria-hidden /> {delivered ? <>Delivered on {delivered}</> : eta ? <>Arriving by {eta}</> : "Shipment details"}</p>
      {order.courierStatus && live && (
        <p className="mt-1 text-sm"><span className="text-ink-soft">Latest update:</span> {order.courierStatus}{order.courierStatusAt ? <span className="text-ink-soft"> · {formatDateTime(order.courierStatusAt)}</span> : null}</p>
      )}
      <dl className="mt-1 text-sm">
        {order.courier && <div className="flex gap-1"><dt className="text-ink-soft">Courier:</dt><dd className="font-medium">{order.courier}</dd></div>}
        {order.awb && <div className="flex gap-1"><dt className="text-ink-soft">AWB:</dt><dd className="font-mono font-medium select-all">{order.awb}</dd></div>}
      </dl>
      {order.trackingUrl && <a className="btn btn-ink btn-sm mt-3" href={order.trackingUrl} target="_blank" rel="noreferrer">Track parcel <ExternalLink size={14} aria-hidden /></a>}
    </div>
  );
}

export function OrderItems({ items }: { items: Item[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => (
        <li key={i.id} className="flex gap-3 py-3">
          <span className="relative h-20 w-16 shrink-0 overflow-hidden rounded-sm border border-line">{i.image && <Image src={i.image} alt="" fill sizes="64px" className="object-cover" />}</span>
          <span className="min-w-0 flex-1 text-sm"><span className="block font-medium">{i.name}</span><span className="block text-xs text-ink-soft">{i.variantLabel} · Qty {i.qty}</span></span>
          <b className="text-sm">{money(i.unitPrice * i.qty)}</b>
        </li>
      ))}
    </ul>
  );
}

export function OrderTotals({ order }: { order: Order }) {
  const row = "flex justify-between text-sm";
  return (
    <dl className="space-y-1.5">
      <div className={row}><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
      {order.offerDiscount > 0 && <div className={`${row} text-pine`}><dt>{order.offerName}</dt><dd>−{money(order.offerDiscount)}</dd></div>}
      {order.couponDiscount > 0 && <div className={`${row} text-pine`}><dt>Coupon {order.couponCode}</dt><dd>−{money(order.couponDiscount)}</dd></div>}
      <div className={row}><dt>Delivery</dt><dd>{order.shippingTotal ? money(order.shippingTotal) : "FREE"}</dd></div>
      {order.codFee > 0 && <div className={row}><dt>COD fee</dt><dd>{money(order.codFee)}</dd></div>}
      <div className="flex justify-between border-t border-line pt-2 text-lg font-semibold"><dt>Total</dt><dd>{money(order.total)}</dd></div>
      <div className={row}><dt>Payment</dt><dd className="font-medium">{order.paymentMethod === "cod" ? "Cash on delivery" : "Online"} · {PAYMENT_LABEL[order.paymentStatus]}</dd></div>
      {order.refundedTotal > 0 && <div className={row}><dt>Refunded</dt><dd className="font-medium">{money(order.refundedTotal)}</dd></div>}
    </dl>
  );
}

export function OrderBody({ order, items, events, actions }: { order: Order; items: Item[]; events: Ev[]; actions?: React.ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">
        <section className="card p-4 sm:p-5"><Tracker order={order} /></section>
        <ShipmentCard order={order} />
        {actions}
        <section className="card p-4 sm:p-5">
          <h2 className="text-xl">Items</h2>
          <OrderItems items={items} />
        </section>
        <section className="card p-4 sm:p-5">
          <h2 className="mb-3 text-xl">Timeline</h2>
          <ol className="space-y-3 border-l border-line pl-4">
            {events.map((e) => (
              <li key={e.id} className="relative"><span className="absolute top-1.5 -left-[23px] size-3 rounded-full border border-line bg-sand" aria-hidden />
                <p className="text-sm font-medium">{e.message}</p><p className="text-xs text-ink-soft">{formatDateTime(e.createdAt)}</p></li>
            ))}
            {events.length === 0 && <li className="text-sm text-ink-soft">Placed {formatDate(order.createdAt)}</li>}
          </ol>
        </section>
      </div>
      <aside className="space-y-5">
        <section className="card p-4"><h2 className="mb-2 text-lg">Bill details</h2><OrderTotals order={order} /></section>
        <section className="card p-4">
          <h2 className="mb-1 flex items-center gap-1.5 text-lg"><MapPin size={17} aria-hidden /> Delivering to</h2>
          <p className="text-sm leading-relaxed"><b>{order.name}</b><br />{order.line1}{order.line2 ? `, ${order.line2}` : ""}<br />{order.city}, {order.state} {order.pincode}</p>
        </section>
        <p className="text-center text-sm"><Link className="font-medium underline" href="/info/contact">Need help with this order?</Link></p>
      </aside>
    </div>
  );
}
