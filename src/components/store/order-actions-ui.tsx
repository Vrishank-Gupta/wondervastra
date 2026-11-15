"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Camera, Check, Clock, MessageSquareHeart, Repeat2, RotateCcw, Star, X, XCircle } from "lucide-react";
import { cancelOrderAction, reorderItems, requestReturnAction, submitFeedbackAction } from "@/app/(store)/order-actions";
import { useCart } from "./cart-context";

const REASONS = ["Wrong size", "Damaged or defective", "Received the wrong item", "Doesn't match the photos", "Changed my mind", "Other"];

export function OrderActions({ token, canCancel, feedbackType }: { token: string; canCancel: boolean; feedbackType: "order" | "delivery" | null }) {
  const router = useRouter();
  const { add } = useCart();
  const [confirming, setConfirming] = useState(false);
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

type ReturnItem = { id: string; name: string; label: string | null; qty: number; image: string | null; returnable: boolean };
type ReturnReq = { status: string; reason: string; details: string | null; adminNote: string | null; photos: string[]; items: { itemId: string; qty: number }[]; pickupAwb: string | null; pickupStatus: string | null; createdAt: number };
const RETURN_STEPS = [["requested", "Requested"], ["approved", "Approved, pickup booked"], ["picked_up", "Picked up"], ["received", "Received by us"], ["completed", "Refunded"]] as const;
const when = (t: number) => new Date(t).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Returns, in plain words: the policy before delivery, the open window with time left after it, the request form
 * (items, reason, photos, condition), and the request's progress afterwards.
 */
export function ReturnPanel({ token, status, deliveredAt, closesAt, open, days, items, request }: {
  token: string; status: string; deliveredAt: number | null; closesAt: number | null; open: boolean; days: number; items: ReturnItem[]; request: ReturnReq | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState(false);
  const [pick, setPick] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // The countdown ticks on its own, and the window closes on screen when time runs out.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open || !closesAt) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() > closesAt) { clearInterval(t); router.refresh(); }
    }, 30_000);
    return () => clearInterval(t);
  }, [open, closesAt, router]);
  const returnable = items.filter((i) => i.returnable);
  if (["cancelled", "pending_payment"].includes(status)) return null;
  const policy = <p className="text-sm text-ink-soft">Returns are accepted within <b>{days} days of delivery</b> for <b>unused, unwashed and undamaged</b> items in their original packaging, with photos. We pick them up from your address once approved.</p>;

  if (request) {
    const rejected = request.status === "rejected";
    const at = RETURN_STEPS.findIndex(([k]) => k === request.status);
    return (
      <section className="card space-y-3 p-4 sm:p-5" data-testid="return-panel">
        <h2 className="flex items-center gap-2 text-xl"><RotateCcw size={18} aria-hidden /> Your return</h2>
        {rejected ? (
          <p className="rounded-sm bg-clay-soft p-3 text-sm"><b>We couldn&apos;t accept this return.</b>{request.adminNote ? <> Reason: {request.adminNote}</> : null}</p>
        ) : (
          <ol className="grid gap-1.5 text-sm sm:grid-cols-5">
            {RETURN_STEPS.map(([k, label], i) => (
              <li key={k} className={`flex items-center gap-1.5 ${i <= at ? "font-semibold" : "text-ink-soft"}`}>
                <span className={`grid size-5 shrink-0 place-items-center rounded-full ${i <= at ? "bg-ink text-white" : "border border-line"}`}>{i <= at && <Check size={12} aria-hidden />}</span>{label}
              </li>
            ))}
          </ol>
        )}
        {request.status === "approved" && <p className="text-sm">Please keep the items packed and ready. {request.pickupAwb ? <>Pickup AWB <b className="font-mono">{request.pickupAwb}</b>.</> : "We'll share the pickup details soon."}</p>}
        {request.adminNote && !rejected && <p className="text-sm"><span className="text-ink-soft">Note from us:</span> {request.adminNote}</p>}
        <p className="text-sm text-ink-soft">Requested {when(request.createdAt)} · {request.reason}{request.details ? `: ${request.details}` : ""}</p>
        {request.photos.length > 0 && <div className="flex flex-wrap gap-2">{request.photos.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="relative block size-16 overflow-hidden rounded-sm border border-line bg-white"><img src={u} alt="Your return photo" className="size-full object-cover" /></a>)}</div>}
      </section>
    );
  }

  if (!deliveredAt) return <section className="card space-y-2 p-4 sm:p-5" data-testid="return-panel"><h2 className="flex items-center gap-2 text-xl"><RotateCcw size={18} aria-hidden /> Easy returns</h2>{policy}</section>;

  if (!open || !returnable.length) {
    return (
      <section className="card space-y-2 p-4 sm:p-5" data-testid="return-panel">
        <h2 className="flex items-center gap-2 text-xl"><RotateCcw size={18} aria-hidden /> Returns</h2>
        <p className="text-sm">Delivered {when(deliveredAt)}. {returnable.length ? <>The return window closed {closesAt ? when(closesAt) : ""}.</> : "These items can't be returned."}</p>
      </section>
    );
  }

  const left = closesAt ? Math.max(0, closesAt - now) : 0;
  const hours = Math.floor(left / 3_600_000);
  const mins = Math.floor((left % 3_600_000) / 60_000);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true); setError("");
    const fd = new FormData();
    fd.append("token", token);
    [...files].slice(0, 5 - photos.length).forEach((f) => fd.append("files", f));
    const res = await fetch("/api/returns/upload", { method: "POST", body: fd }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setUploading(false);
    if (!res?.ok) return setError(json.error ?? "Couldn't upload that photo. Please try again.");
    setPhotos((p) => [...p, ...(json.urls as string[])].slice(0, 5));
  };
  return (
    <section className="card space-y-3 p-4 sm:p-5" data-testid="return-panel">
      <h2 className="flex items-center gap-2 text-xl"><RotateCcw size={18} aria-hidden /> Returns</h2>
      <p className="flex items-start gap-2 rounded-sm bg-pine-soft p-3 text-sm"><Clock size={16} aria-hidden className="mt-0.5 shrink-0" /><span>Delivered {when(deliveredAt)}. <b>Return window open until {closesAt ? when(closesAt) : ""}</b> (<span data-testid="return-left" suppressHydrationWarning>{hours >= 24 ? `${Math.floor(hours / 24)} ${Math.floor(hours / 24) === 1 ? "day" : "days"} ${hours % 24} hours` : hours >= 1 ? `${hours} ${hours === 1 ? "hour" : "hours"} ${mins} min` : `${mins} min`}</span> left).</span></p>
      {policy}
      {!form ? (
        <button className="btn btn-white btn-sm" onClick={() => setForm(true)}><RotateCcw size={15} aria-hidden /> Start a return</button>
      ) : (
        <form className="space-y-4 rounded-sm border border-line bg-ivory p-3 sm:p-4" onSubmit={async (e) => {
          e.preventDefault(); setError("");
          const chosen = Object.entries(pick).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty }));
          if (!chosen.length) return setError("Choose the items you want to return.");
          if (!reason) return setError("Please pick a reason.");
          if (!photos.length) return setError("Add at least one photo of the items you're returning.");
          if (!confirmed) return setError("Please confirm the items are unused, unwashed, undamaged and in their original packaging.");
          setBusy(true);
          const r = await requestReturnAction(token, { reason, details, items: chosen, photos, confirmed });
          setBusy(false);
          if (r.error) setError(r.error); else router.refresh();
        }}>
          <fieldset className="space-y-2">
            <legend className="label">1. What are you returning?</legend>
            {returnable.map((i) => (
              <label key={i.id} className="flex items-center gap-3 rounded-sm border border-line bg-white p-2">
                <input type="checkbox" className="size-5 accent-ink" checked={(pick[i.id] ?? 0) > 0} onChange={(e) => setPick((p) => ({ ...p, [i.id]: e.target.checked ? i.qty : 0 }))} aria-label={`Return ${i.name}${i.label ? `, ${i.label}` : ""}`} />
                {i.image && <img src={i.image} alt="" className="size-12 shrink-0 rounded-sm object-contain" />}
                <span className="min-w-0 flex-1 text-sm"><b className="line-clamp-1">{i.name}</b><span className="block text-xs text-ink-soft">{i.label}</span></span>
                {i.qty > 1 && (pick[i.id] ?? 0) > 0 && <select aria-label={`How many ${i.name}`} className="input w-16 py-1" value={pick[i.id]} onChange={(e) => setPick((p) => ({ ...p, [i.id]: Number(e.target.value) }))}>{Array.from({ length: i.qty }, (_, n) => <option key={n + 1}>{n + 1}</option>)}</select>}
              </label>
            ))}
          </fieldset>
          <div>
            <label className="label" htmlFor="reason">2. Why are you returning it?</label>
            <select id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Choose a reason</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
            <textarea aria-label="More details" className="input mt-2" rows={2} maxLength={1000} placeholder="Tell us more (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
          <div>
            <p className="label">3. Add photos <span className="font-normal text-ink-soft">(1 to 5: the items, labels and packaging)</span></p>
            <div className="flex flex-wrap gap-2">
              {photos.map((u) => (
                <span key={u} className="relative size-20 overflow-hidden rounded-sm border border-line bg-white">
                  <img src={u} alt="Return photo" className="size-full object-cover" />
                  <button type="button" aria-label="Remove photo" onClick={() => setPhotos((p) => p.filter((x) => x !== u))} className="absolute top-0.5 right-0.5 grid size-7 place-items-center rounded-full bg-white/90"><X size={14} /></button>
                </span>
              ))}
              {photos.length < 5 && (
                <label className="grid size-20 cursor-pointer place-items-center rounded-sm border border-dashed border-ink/40 bg-white text-center text-xs">
                  <span><Camera size={18} aria-hidden className="mx-auto" />{uploading ? "Uploading…" : "Add photo"}</span>
                  <input type="file" accept="image/*" multiple className="sr-only" aria-label="Add return photos" disabled={uploading} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-ink" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirm these items are unused, unwashed, undamaged, with tags and in their original packaging.</label>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy || uploading}>Send return request</button>
            <button type="button" className="btn btn-white btn-sm" onClick={() => setForm(false)}>Not now</button>
          </div>
          <p className="text-xs text-ink-soft">We review requests within 1 working day. Once approved, we book a free pickup from your address and refund you after we receive and check the items.</p>
        </form>
      )}
      {error && <p className="text-sm font-medium text-clay" role="alert">{error}</p>}
    </section>
  );
}
