import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Star } from "lucide-react";
import { db, schema } from "@/db";
import { ReviewActions } from "@/components/admin/misc-actions";
import { Empty, PageHead, Panel } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Reviews & feedback" };

export default async function Reviews() {
  const r = schema.reviews, f = schema.feedback;
  const [reviews, feedback, summary] = await Promise.all([
    db.select({ id: r.id, rating: r.rating, body: r.body, name: r.name, status: r.status, createdAt: r.createdAt, product: schema.products.name, productId: r.productId }).from(r).leftJoin(schema.products, eq(schema.products.id, r.productId)).orderBy(sql`case when ${r.status} = 'pending' then 0 else 1 end`, desc(r.createdAt)).limit(200),
    db.select({ id: f.id, type: f.type, rating: f.rating, comment: f.comment, createdAt: f.createdAt, orderId: f.orderId, number: schema.orders.number, name: schema.orders.name }).from(f).leftJoin(schema.orders, eq(schema.orders.id, f.orderId)).orderBy(desc(f.createdAt)).limit(200),
    db.select({ type: f.type, avg: sql<number>`avg(${f.rating})`, n: sql<number>`count(*)` }).from(f).groupBy(f.type),
  ]);
  const stat = (t: string) => summary.find((s) => s.type === t);
  return (
    <>
      <PageHead title="Reviews & feedback" sub="Only reviews you publish appear on the store. All of them come from real orders." />
      <div className="mb-5 grid grid-cols-2 gap-3">
        {(["order", "delivery"] as const).map((t) => {
          const s = stat(t);
          return <div key={t} className="rounded-sm border border-line bg-white p-4"><p className="text-xs font-medium text-ink-soft">{t === "order" ? "Ordering experience" : "Delivery experience"}</p><p className="font-display text-3xl">{s ? `${Number(s.avg).toFixed(1)}★` : "—"}</p><p className="text-xs text-ink-soft">{s ? `${s.n} responses` : "No responses yet"}</p></div>;
        })}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Product reviews">
          {reviews.length ? <ul className="divide-y divide-ink/10">{reviews.map((x) => (
            <li key={x.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p><b>{x.name}</b> on <Link className="underline" href={`/admin/products/${x.productId}`}>{x.product}</Link></p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${x.status === "pending" ? "bg-sand-soft" : x.status === "approved" ? "bg-pine-soft" : "bg-line"}`}>{x.status}</span>
              </div>
              <p className="my-1 flex" aria-label={`${x.rating} out of 5`}>{Array.from({ length: x.rating }).map((_, i) => <Star key={i} size={14} className="fill-ink text-ink" aria-hidden />)}</p>
              {x.body && <p className="mb-2 text-ink-soft">{x.body}</p>}
              <ReviewActions id={x.id} status={x.status} />
            </li>
          ))}</ul> : <Empty>Reviews arrive through the post-delivery feedback link.</Empty>}
        </Panel>
        <Panel title="Order & delivery feedback">
          {feedback.length ? <ul className="divide-y divide-ink/10">{feedback.map((x) => (
            <li key={x.id} className="py-2.5 text-sm">
              <p><b>{x.rating}★</b> <span className="capitalize">{x.type}</span> · <Link className="underline" href={`/admin/orders/${x.orderId}`}>{x.number}</Link> · {x.name}</p>
              {x.comment && <p className="text-ink-soft">{x.comment}</p>}
              <p className="text-xs text-ink-soft">{formatDateTime(x.createdAt)}</p>
            </li>
          ))}</ul> : <Empty>Links go out with order confirmation and after delivery.</Empty>}
        </Panel>
      </div>
    </>
  );
}
