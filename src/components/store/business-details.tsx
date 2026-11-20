import type { StoreSettings } from "@/lib/settings";
import { business } from "@/lib/business";

/** The seller's identity and every way to reach them, as a plain list (Contact and About pages). */
export function BusinessDetails({ settings }: { settings: StoreSettings }) {
  const b = business(settings);
  const rows: [string, React.ReactNode][] = [
    ["Business name", b.tradingAs ? <>{b.name} (trading as {b.tradingAs})</> : b.name],
    ...(b.address ? [["Based in", b.address] as [string, React.ReactNode]] : []),
    ...(b.phone ? [["Phone / WhatsApp", <a key="t" href={`tel:${b.tel}`}>{b.phone}</a>] as [string, React.ReactNode]] : []),
    ...(b.email ? [["Email", <a key="e" href={`mailto:${b.email}`}>{b.email}</a>] as [string, React.ReactNode]] : []),
    ...(b.hours ? [["Hours", b.hours] as [string, React.ReactNode]] : []),
    ...(b.gstin ? [["GSTIN", b.gstin] as [string, React.ReactNode]] : []),
    ...(b.grievanceOfficer ? [["Grievance officer", <>{b.grievanceOfficer}{b.email ? <>, <a href={`mailto:${b.email}`}>{b.email}</a></> : null}</>] as [string, React.ReactNode]] : []),
  ];
  return (
    <dl className="not-prose mt-4 grid grid-cols-1 gap-x-6 gap-y-2 border border-line p-4 text-sm sm:grid-cols-[10rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold">{k}</dt>
          <dd className="mb-2 text-ink-soft sm:mb-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
