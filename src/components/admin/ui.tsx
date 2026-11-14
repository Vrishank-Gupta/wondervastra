import { PAYMENT_LABEL, STATUS_LABEL } from "@/lib/format";

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-3xl">{title}</h1>{sub && <p className="text-sm text-ink-soft">{sub}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Panel({ title, children, actions, className = "" }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-sm border border-line bg-white p-4 ${className}`}>
      {(title || actions) && <div className="mb-3 flex items-center justify-between gap-2">{title && <h2 className="font-sans text-base font-semibold tracking-normal">{title}</h2>}{actions}</div>}
      {children}
    </section>
  );
}
const STATUS_CLASS: Record<string, string> = {
  pending_payment: "bg-line text-ink", confirmed: "bg-sand-soft text-ink", packed: "bg-slate-soft text-ink", shipped: "bg-slate-soft text-ink",
  out_for_delivery: "bg-slate-soft text-ink", delivered: "bg-pine-soft text-ink", cancelled: "bg-clay-soft text-ink", return_requested: "bg-clay-soft text-ink", returned: "bg-line text-ink",
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_CLASS[status] ?? "bg-line"}`}>{STATUS_LABEL[status] ?? status}</span>;
}
export function PayBadge({ status, method }: { status: string; method: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${status === "paid" ? "bg-pine-soft" : status === "failed" ? "bg-clay-soft" : "bg-line"}`}>{method === "cod" && status === "pending" ? "COD due" : PAYMENT_LABEL[status]}</span>;
}
export function Tbl({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-sm border border-line bg-white"><table className="w-full text-left text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-ink-soft">{children}</table></div>;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-sm border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">{children}</p>;
}
