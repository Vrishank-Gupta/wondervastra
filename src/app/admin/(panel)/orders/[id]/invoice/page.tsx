import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PrintButton } from "@/components/admin/print-button";
import { formatDate, money } from "@/lib/format";
import { gstBreakup } from "@/lib/gst";
import { ensureInvoiceNumber } from "@/lib/orders";
import { getSettings } from "@/lib/settings";

/**
 * Invoice + packing slip. With a GSTIN in Settings it's a GST tax invoice: sequential number, place of supply,
 * HSN, taxable value and CGST/SGST or IGST per line. Without one it's a plain invoice (no tax claimed).
 */
export default async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [first] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!first) notFound();
  const invoiceNumber = await ensureInvoiceNumber(id);
  const o = invoiceNumber ? { ...first, invoiceNumber, invoicedAt: first.invoicedAt ?? Date.now() } : first;
  const [items, s] = await Promise.all([db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id)), getSettings()]);
  const seller = s.legalName || s.storeName;
  const gst = Boolean(s.gstin);
  const b = gstBreakup({
    items: items.map((i) => ({ name: i.name, hsnCode: i.hsnCode, unitPrice: i.unitPrice, qty: i.qty })),
    discount: o.offerDiscount + o.couponDiscount, charges: o.shippingTotal + o.codFee,
    sellerState: s.businessState, buyerState: o.state,
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-white p-6 text-sm">
      <PrintButton />
      <section>
        <div className="flex justify-between gap-4 border-b border-line pb-3">
          <div>
            <p className="font-display text-2xl">{seller}</p>
            {s.businessAddress && <p className="whitespace-pre-line">{s.businessAddress}</p>}
            {s.businessState && <p>State: {s.businessState}</p>}
            {s.gstin && <p>GSTIN: {s.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">{gst ? "Tax invoice" : "Invoice"}</p>
            {o.invoiceNumber ? <p>Invoice no. <b>{o.invoiceNumber}</b></p> : <p className="text-clay">Not issued (order {o.status === "cancelled" ? "cancelled" : "unpaid"})</p>}
            <p>Date: {formatDate(o.invoicedAt ?? o.placedAt ?? o.createdAt)}</p>
            <p>Order {o.number}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <p><b>Bill & ship to:</b><br />{o.name}<br />{o.line1}{o.line2 ? `, ${o.line2}` : ""}, {o.city}, {o.state} {o.pincode}<br />{o.phone}</p>
          {gst && <p className="sm:text-right"><b>Place of supply:</b> {o.state}<br /><b>Tax type:</b> {b.interState ? "IGST (inter-state)" : "CGST + SGST (intra-state)"}<br /><b>Reverse charge:</b> No</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full border-collapse text-left [&_td]:border-b [&_td]:py-1.5 [&_td]:pr-2 [&_th]:border-b [&_th]:border-ink [&_th]:py-1.5 [&_th]:pr-2">
            <thead><tr><th>Item</th><th>HSN/SAC</th><th className="text-right">Qty</th>{gst ? <><th className="text-right">Taxable value</th><th className="text-right">GST</th><th className="text-right">Tax</th></> : <th className="text-right">Rate</th>}<th className="text-right">Amount</th></tr></thead>
            <tbody>
              {gst
                ? b.lines.map((l, n) => <tr key={n}><td>{l.name}{items[n] && <span className="block text-xs">{items[n].variantLabel}</span>}</td><td>{l.hsn ?? "—"}</td><td className="text-right">{l.qty}</td><td className="text-right">{money(l.taxable)}</td><td className="text-right">{l.rate}%</td><td className="text-right">{money(l.tax)}</td><td className="text-right">{money(l.gross)}</td></tr>)
                : items.map((i) => <tr key={i.id}><td>{i.name}<span className="block text-xs">{i.variantLabel}</span></td><td>{i.hsnCode ?? "—"}</td><td className="text-right">{i.qty}</td><td className="text-right">{money(i.unitPrice)}</td><td className="text-right">{money(i.unitPrice * i.qty)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <dl className="mt-2 ml-auto w-72 space-y-1">
          {gst ? <>
            <div className="flex justify-between"><dt>Taxable value</dt><dd>{money(b.taxable)}</dd></div>
            {b.interState ? <div className="flex justify-between"><dt>IGST</dt><dd>{money(b.igst)}</dd></div> : <>
              <div className="flex justify-between"><dt>CGST</dt><dd>{money(b.cgst)}</dd></div>
              <div className="flex justify-between"><dt>SGST</dt><dd>{money(b.sgst)}</dd></div>
            </>}
            {(o.offerDiscount + o.couponDiscount) > 0 && <p className="text-xs text-ink-soft">Includes discounts of {money(o.offerDiscount + o.couponDiscount)}{o.couponCode ? ` (coupon ${o.couponCode})` : ""}, applied before tax.</p>}
          </> : <>
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(o.subtotal)}</dd></div>
            {o.offerDiscount > 0 && <div className="flex justify-between"><dt>Offer</dt><dd>−{money(o.offerDiscount)}</dd></div>}
            {o.couponDiscount > 0 && <div className="flex justify-between"><dt>Coupon</dt><dd>−{money(o.couponDiscount)}</dd></div>}
            <div className="flex justify-between"><dt>Delivery</dt><dd>{money(o.shippingTotal)}</dd></div>
            {o.codFee > 0 && <div className="flex justify-between"><dt>COD fee</dt><dd>{money(o.codFee)}</dd></div>}
          </>}
          <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>Total</dt><dd>{money(o.total)}</dd></div>
        </dl>
        <p className="mt-3 text-xs">{gst ? "Prices include GST." : "Prices include applicable taxes."} Payment: {o.paymentMethod === "cod" ? "Cash on delivery" : `Online (${o.razorpayPaymentId ?? "Razorpay"})`}.{gst && !s.businessState ? " Set your registered state in Settings to show CGST/SGST for same-state orders." : ""}</p>
        {gst && <p className="mt-6 text-right text-xs">For {seller}<br /><br />Authorised signatory</p>}
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
