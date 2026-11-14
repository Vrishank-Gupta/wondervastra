import { money } from "@/lib/format";

const DAY = 86_400_000;
const dayLabel = (d: number, opts: Intl.DateTimeFormatOptions) => new Date(d * DAY).toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });

function niceMax(v: number) {
  if (v <= 0) return 100000;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= v) ?? 10;
  return step * mag;
}
const compact = (p: number) => { const r = p / 100; return r >= 10000 ? `₹${r / 1000}K` : `₹${r.toLocaleString("en-IN")}`; };

/** Single-series daily revenue: one hue, thin columns, hairline grid, per-column tooltip and a table fallback. */
export function RevenueChart({ data }: { data: { day: number; revenue: number; orders: number }[] }) {
  const peak = niceMax(Math.max(...data.map((d) => d.revenue)));
  const ticks = [peak, peak / 2, 0];
  return (
    <figure>
      <div className="grid grid-cols-[3rem_1fr] gap-2">
        <div className="relative h-44 text-right text-[11px] text-ink-soft" aria-hidden>
          {ticks.map((t, i) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / 2) * 100}%` }}>{compact(t)}</span>)}
        </div>
        <div>
          <div className="relative h-44 border-b border-line">
            <div className="absolute inset-x-0 top-0 border-t border-line" aria-hidden />
            <div className="absolute inset-x-0 top-1/2 border-t border-line" aria-hidden />
            <div className="absolute inset-0 flex items-stretch">
              {data.map((d) => (
                <div key={d.day} tabIndex={0} aria-label={`${dayLabel(d.day, { day: "numeric", month: "short" })}: ${money(d.revenue)}, ${d.orders} orders`} className="group relative flex min-w-0 flex-1 items-end justify-center outline-none hover:bg-ink/5 focus:bg-ink/5">
                  <div className="w-[70%] max-w-6 rounded-t-[4px] bg-chart" style={{ height: d.revenue ? `max(3px, ${(d.revenue / peak) * 100}%)` : 0 }} />
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-sm bg-ink px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block group-focus:block">
                    <b>{money(d.revenue)}</b> · {d.orders} {d.orders === 1 ? "order" : "orders"}<br />{dayLabel(d.day, { weekday: "short", day: "numeric", month: "short" })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-ink-soft" aria-hidden>
            <span>{dayLabel(data[0].day, { day: "numeric", month: "short" })}</span>
            <span>{dayLabel(data[15].day, { day: "numeric", month: "short" })}</span>
            <span>Today</span>
          </div>
        </div>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium text-ink-soft">View as table</summary>
        <div className="mt-1 max-h-48 overflow-y-auto">
          <table className="w-full"><thead><tr className="text-left text-ink-soft"><th>Date</th><th className="text-right">Revenue</th><th className="text-right">Orders</th></tr></thead>
            <tbody>{[...data].reverse().map((d) => <tr key={d.day}><td>{dayLabel(d.day, { day: "numeric", month: "short" })}</td><td className="text-right">{money(d.revenue)}</td><td className="text-right">{d.orders}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Ranked horizontal bars with the value at the tip. */
export function RankBars({ rows, titleCase = false }: { rows: { name: string; value: number; sub: string }[]; titleCase?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.name} title={`${r.name}: ${money(r.value)} (${r.sub})`}>
          <div className="mb-0.5 flex justify-between gap-2 text-xs"><span className={`truncate font-medium ${titleCase ? "capitalize" : ""}`}>{r.name}</span><span className="shrink-0 text-ink-soft">{r.sub}</span></div>
          <div className="flex items-center gap-2">
            <div className="h-2.5 rounded-r-[4px] bg-chart" style={{ width: `${Math.max(2, (r.value / max) * 75)}%` }} />
            <span className="text-xs font-medium whitespace-nowrap">{money(r.value)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
