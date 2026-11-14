"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquareHeart, Repeat2, RotateCcw, Star, XCircle } from "lucide-react";
import { cancelOrderAction, reorderItems, requestReturnAction, submitFeedbackAction } from "@/app/(store)/order-actions";
import { useCart } from "./cart-context";

const REASONS = ["Wrong size", "Damaged or defective", "Received the wrong item", "Doesn't match the photos", "Changed my mind", "Other"];

export function OrderActions({ token, canCancel, canReturn, feedbackType }: { token: string; canCancel: boolean; canReturn: boolean; feedbackType: "order" | "delivery" | null }) {
  const router = useRouter();
  const { add } = useCart();
  const [confirming, setConfirming] = useState(false);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <section className="card space-y-3 p-4 sm:p-5 no-print">
      <div className="flex flex-wrap gap-2">
        {feedbackType && <Link href={`/feedback/${token}?type=${feedbackType}`} className="btn btn-white btn-sm"><MessageSquareHeart size={15} aria-hidden /> Rate your {feedbackType === "delivery" ? "delivery" : "experience"}</Link>}
        <button className="btn btn-white btn-sm" disabled={busy} onClick={async () => {
          setBusy(true);
          const items = await reorderItems(token);
          items.forEach((i) => add(i.variantId, i.qty, { open: false }));
          router.push("/cart");
        }}><Repeat2 size={15} aria-hidden /> Buy again</button>
        {canReturn && <button className="btn btn-white btn-sm" onClick={() => setReturning((v) => !v)}><RotateCcw size={15} aria-hidden /> Request return</button>}
        {canCancel && !confirming && <button className="btn btn-white btn-sm" onClick={() => setConfirming(true)}><XCircle size={15} aria-hidden /> Cancel order</button>}
      </div>
      {confirming && (
        <div className="rounded-sm border border-line bg-clay-soft p-3 text-sm" role="alert">
          <p className="font-medium">Cancel this order?</p>
          <div className="mt-2 flex gap-2">
            <button className="btn btn-ink btn-sm" disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await cancelOrderAction(token);
              setBusy(false); setConfirming(false);
              if (r.error) setError(r.error); else router.refresh();
            }}>Yes, cancel</button>
            <button className="btn btn-white btn-sm" onClick={() => setConfirming(false)}>Keep my order</button>
          </div>
        </div>
      )}
      {returning && (
        <form className="space-y-2 rounded-sm border border-line bg-ivory p-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await requestReturnAction(token, reason, details);
          setBusy(false);
          if (r.error) setError(r.error); else { setReturning(false); router.refresh(); }
        }}>
          <label className="label" htmlFor="reason">Why are you returning it?</label>
          <select id="reason" className="input" required value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Choose a reason</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          <textarea aria-label="More details" className="input" rows={2} placeholder="Anything else we should know?" value={details} onChange={(e) => setDetails(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={busy}>Submit request</button>
        </form>
      )}
      {error && <p className="text-sm font-medium text-clay" role="alert">{error}</p>}
    </section>
  );
}

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)} className="p-0.5">
          <Star size={32} className={n <= value ? "fill-ink text-ink" : "text-ink/30"} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function FeedbackForm({ token, type, items }: { token: string; type: "order" | "delivery"; items: { productId: string; name: string }[] }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [reviews, setReviews] = useState<Record<string, { rating: number; body: string }>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (done) return (
    <div className="card-pop p-6 text-center" role="status">
      <p className="font-display text-3xl">Thank you for your feedback</p>
      <p className="mt-1 text-ink-soft">Your feedback helps us get better.</p>
      <Link href="/shop" className="btn btn-primary mt-4">Keep shopping</Link>
    </div>
  );
  const unique = items.filter((x, i, a) => a.findIndex((y) => y.productId === x.productId) === i);
  return (
    <form className="card-pop space-y-5 p-5" onSubmit={async (e) => {
      e.preventDefault();
      if (!rating) return setError("Please tap a star rating first.");
      setBusy(true);
      const r = await submitFeedbackAction(token, type, rating, comment, Object.entries(reviews).filter(([, v]) => v.rating > 0).map(([productId, v]) => ({ productId, ...v })));
      setBusy(false);
      if (r.error) setError(r.error); else setDone(true);
    }}>
      <div>
        <p className="mb-1 font-semibold">{type === "order" ? "How was placing your order?" : "How was your delivery experience?"}</p>
        <Stars value={rating} onChange={setRating} label="Overall rating" />
      </div>
      <div><label className="label" htmlFor="c">Anything to add? <span className="font-normal text-ink-soft">(optional)</span></label><textarea id="c" className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      {type === "delivery" && (
        <div className="space-y-4 border-t border-line pt-4">
          <p className="font-semibold">Rate what you bought</p>
          {unique.map((i) => (
            <div key={i.productId}>
              <p className="text-sm font-medium">{i.name}</p>
              <Stars value={reviews[i.productId]?.rating ?? 0} label={`Rating for ${i.name}`} onChange={(n) => setReviews((r) => ({ ...r, [i.productId]: { rating: n, body: r[i.productId]?.body ?? "" } }))} />
              {reviews[i.productId]?.rating > 0 && <textarea aria-label={`Review for ${i.name}`} className="input mt-1" rows={2} placeholder="What did you like?" onChange={(e) => setReviews((r) => ({ ...r, [i.productId]: { ...r[i.productId], body: e.target.value } }))} />}
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm font-medium text-clay" role="alert">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>Send feedback</button>
    </form>
  );
}
