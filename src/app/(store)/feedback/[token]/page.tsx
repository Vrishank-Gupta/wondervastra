import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedbackForm } from "@/components/store/order-actions-ui";
import { orderBundleByToken } from "@/lib/order-access";

export const metadata: Metadata = { title: "Share your feedback", robots: { index: false, follow: false } };

export default async function FeedbackPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ type?: string }> }) {
  const { token } = await params;
  const { type } = await searchParams;
  const data = await orderBundleByToken(token);
  if (!data) notFound();
  const kind = type === "delivery" ? "delivery" : "order";
  return (
    <div className="container-x flex justify-center py-10">
      <div className="w-full max-w-lg">
        <h1 className="mb-1 text-4xl">Tell us how we did</h1>
        <p className="mb-5 text-sm text-ink-soft">Order {data.order.number}. Takes about 20 seconds.</p>
        <FeedbackForm token={token} type={kind} items={data.items.map((i) => ({ productId: i.productId, name: i.name }))} />
      </div>
    </div>
  );
}
