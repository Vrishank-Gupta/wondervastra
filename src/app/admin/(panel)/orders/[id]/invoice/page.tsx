import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PrintButton } from "@/components/admin/print-button";
import { formatDate, money } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export default async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!o) notFound();
  const [items, s] = await Promise.all([db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id)), getSettings()]);
  const seller = s.legalName || s.storeName;
  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-white p-6 text-sm">
      <PrintButton />
      <section>
        <div className="flex justify-between gap-4 border-b border-line pb-3">
          <div><p className="font-display text-2xl">{seller}</p>{s.businessAddress && <p className="whitespace-pre-line">{s.businessAddress}</p>}{s.gstin && <p>GSTIN: {s.gstin}</p>}</div>
          <div className="text-right"><p className="text-lg font-semibold">{s.gstin ? "Tax invoice" : "Invoice"}</p><p>Order {o.number}</p><p>{formatDate(o.placedAt ?? o.createdAt)}</p></div>
        </div>
        <p className="mt-3"><b>Bill & ship to:</b><br />{o.name}<br />{o.line1}{o.line2 ? `, ${o.line2}` : ""}, {o.city}, {o.state} {o.pincode}<br />{o.phone}</p>
        <table className="mt-3 w-full border-collapse text-left [&_td]:border-b [&_td]:py-1.5 [&_th]:border-b [&_th]:border-ink [&_th]:py-1.5">
          <thead><tr><th>Item</th><th>HSN</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{items.map((i) => <tr key={i.id}><td>{i.name}<span className="block text-xs">{i.variantLabel}</span></td><td>{i.hsnCode ?? "—"}</td><td className="text-right">{i.qty}</td><td className="text-right">{money(i.unitPrice)}</td><td className="text-right">{money(i.unitPrice * i.qty)}</td></tr>)}</tbody>
        </table>
        <dl className="mt-2 ml-auto w-64 space-y-1">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(o.subtotal)}</dd></div>
          {o.offerDiscount > 0 && <div className="flex justify-between"><dt>Offer</dt><dd>−{money(o.offerDiscount)}</dd></div>}
          {o.couponDiscount > 0 && <div className="flex justify-between"><dt>Coupon</dt><dd>−{money(o.couponDiscount)}</dd></div>}
          <div className="flex justify-between"><dt>Delivery</dt><dd>{money(o.shippingTotal)}</dd></div>
          {o.codFee > 0 && <div className="flex justify-between"><dt>COD fee</dt><dd>{money(o.codFee)}</dd></div>}
          <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>Total</dt><dd>{money(o.total)}</dd></div>
        </dl>
        <p className="mt-3 text-xs">Prices include applicable taxes. Payment: {o.paymentMethod === "cod" ? "Cash on delivery" : `Online (${o.razorpayPaymentId ?? "Razorpay"})`}.</p>
      </section>
      <section className="break-before-page border-t border-dashed border-ink pt-6">
        <h2 className="text-xl">Packing slip · {o.number}</h2>
        <p className="mt-2 text-base"><b>To:</b> {o.name}<br />{o.line1}{o.line2 ? `, ${o.line2}` : ""}<br />{o.city}, {o.state} <b>{o.pincode}</b><br />Phone: {o.phone}</p>
        {o.paymentMethod === "cod" && <p className="mt-2 inline-block border border-line p-2 text-lg font-semibold">COLLECT {money(o.total)} (COD)</p>}
        <ul className="mt-3 space-y-1">{items.map((i) => <li key={i.id} className="flex items-center gap-2"><span className="inline-block size-4 border border-line" /> <b>{i.qty} ×</b> {i.name} ({i.variantLabel}){i.sku ? ` · ${i.sku}` : ""}</li>)}</ul>
        {o.customerNote && <p className="mt-3"><b>Customer note:</b> {o.customerNote}</p>}
      </section>
    </div>
  );
}
