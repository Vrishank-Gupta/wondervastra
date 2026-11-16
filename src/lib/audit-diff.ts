/**
 * Turns an audit entry's before/after snapshots into plain changes an owner can read:
 * "Top (Black) · 10–11 Y: price ₹260 → ₹210", "Piece renamed: Top → Top (Black), all 6 sizes".
 * Listings get a size-by-size view of prices, MRP, stock, pieces and colours; everything else gets a
 * field-by-field list with readable names and rupees formatted.
 */
type Obj = Record<string, unknown>;
export type Change = { label: string; from?: string; to?: string; note?: string; kind?: "add" | "remove" | "change" };
export type ChangeGroup = { title: string; changes: Change[] };

const rs = (p: unknown) => (typeof p === "number" ? `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—");
const MONEY = /^(price|compareAtPrice|mrp|minPrice|deliveryCharge|comboAbove|codFee|codMaxOrder|defaultDeliveryCharge|minSubtotal|value|maxDiscount|freeShippingAbove)$/;
const LABELS: Record<string, string> = {
  name: "Name", slug: "Web address", shortDescription: "Short description", description: "Description", status: "Status",
  price: "Main price", compareAtPrice: "Main MRP", tags: "Search words", featured: "Featured on home page", material: "Material", care: "Care",
  sizeGuide: "Size guide note", sizeChart: "Size chart", sizeHeights: "Heights per size", option1Label: "Name for “size”", option2Label: "Name for “piece/colour”",
  deliveryMode: "Delivery", deliveryCharge: "Delivery charge", codAllowed: "Cash on delivery", returnable: "Returnable", forceOutOfStock: "Marked out of stock",
  comingSoon: "Coming soon", launchNote: "Launch note", showStockCount: "Show pieces available", maxPerOrder: "Most pieces per order", maxPerCustomer: "Most pieces per customer",
  lowStockThreshold: "“Only a few left” below", minPieces: "Sold in", comboAbove: "Any number above cart value", hsnCode: "HSN code", seoTitle: "Google title", seoDescription: "Google description",
  categoryId: "Category", brandId: "Brand", active: "Active",
};
const SKIP = new Set(["id", "createdAt", "updatedAt", "variants", "images", "productId"]);
const human = (k: string) => LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
function show(k: string, v: unknown): string {
  if (v == null || v === "") return "empty";
  if (MONEY.test(k)) return rs(v);
  if (typeof v === "boolean") return v ? "on" : "off";
  if (k === "minPieces") return `${v}s`;
  if (Array.isArray(v)) return v.length ? (v.every((x) => typeof x === "string") ? v.join(", ") : `${v.length} items`) : "none";
  if (typeof v === "object") return "changed";
  const s = String(v);
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function fieldChanges(b: Obj, a: Obj): Change[] {
  return Object.keys(a).filter((k) => !SKIP.has(k) && k in b && !same(a[k], b[k])).map((k) => {
    if (k === "sizeChart" || k === "sizeHeights" || (typeof a[k] === "object" && a[k] && !Array.isArray(a[k]))) return { label: human(k), note: "edited", kind: "change" as const };
    if ((k === "description" || k === "shortDescription") && String(a[k] ?? "").length > 90) return { label: human(k), note: "rewritten", from: show(k, b[k]), to: show(k, a[k]), kind: "change" as const };
    return { label: human(k), from: show(k, b[k]), to: show(k, a[k]), kind: "change" as const };
  });
}

type V = { id?: string; option1: string; option2: string; price?: number | null; mrp?: number | null; stock?: number; sku?: string | null; colorHex?: string | null; active?: boolean };
/** A listing's pieces and sizes, compared the way the store shows them (an empty price means the main price). */
function variantChanges(b: Obj, a: Obj): ChangeGroup[] {
  const before = ((b.variants as V[]) ?? []).filter((v) => v.active !== false);
  const after = ((a.variants as V[]) ?? []).filter((v) => v.active !== false);
  const price = (o: Obj, v: V) => v.price ?? (o.price as number);
  const mrp = (o: Obj, v: V) => v.mrp ?? (o.compareAtPrice as number | null) ?? null;
  const base = (s: string) => s.replace(/\s*\([^()]*\)\s*$/, "").trim();
  const used = new Set<V>();
  const pairs: { o?: V; n?: V }[] = [];
  for (const n of after) {
    const o = before.find((x) => !used.has(x) && n.id && x.id === n.id)
      ?? before.find((x) => !used.has(x) && x.option1 === n.option1 && x.option2 === n.option2)
      ?? before.find((x) => !used.has(x) && x.option1 === n.option1 && base(x.option2) === base(n.option2));
    if (o) used.add(o);
    pairs.push({ o, n });
  }
  for (const o of before) if (!used.has(o)) pairs.push({ o });

  // Renames and colour changes usually apply to every size: show them once.
  const renames = new Map<string, Set<string>>();
  const priceRows: Change[] = [], stockRows: Change[] = [], other: Change[] = [];
  for (const { o, n } of pairs) {
    if (o && n) {
      if (o.option2 !== n.option2) { const k = `${o.option2}→${n.option2}`; renames.set(k, (renames.get(k) ?? new Set()).add(n.option1)); }
      const where = `${n.option2} · ${n.option1}`;
      const p0 = price(b, o), p1 = price(a, n), m0 = mrp(b, o), m1 = mrp(a, n);
      if (p0 !== p1) priceRows.push({ label: where, from: `price ${rs(p0)}`, to: `${rs(p1)}${n.price == null ? " (main price)" : ""}`, kind: "change" });
      if (m0 !== m1) priceRows.push({ label: where, from: `MRP ${rs(m0)}`, to: `${rs(m1)}${n.mrp == null ? " (main MRP)" : ""}`, kind: "change" });
      if (n.stock != null && o.stock !== n.stock) stockRows.push({ label: where, from: `${o.stock}`, to: `${n.stock}`, kind: "change" });
      if ((o.colorHex ?? null) !== (n.colorHex ?? null) && o.option2 === n.option2) other.push({ label: where, note: `colour dot ${o.colorHex ?? "none"} → ${n.colorHex ?? "none"}`, kind: "change" });
    } else if (n) other.push({ label: `${n.option2} · ${n.option1}`, note: `added (stock ${n.stock ?? 0}, ${rs(price(a, n))})`, kind: "add" });
    else if (o) other.push({ label: `${o.option2} · ${o.option1}`, note: `removed (had stock ${o.stock ?? 0})`, kind: "remove" });
  }
  const sizes = new Set(after.map((v) => v.option1)).size;
  const groups: ChangeGroup[] = [];
  if (renames.size) groups.push({ title: "Pieces renamed", changes: [...renames].map(([k, s]) => { const [from, to] = k.split("→"); return { label: s.size === sizes ? `all ${s.size} sizes` : [...s].join(", "), from, to, kind: "change" as const }; }) });
  if (priceRows.length) groups.push({ title: `Prices (${priceRows.length})`, changes: priceRows });
  if (stockRows.length) groups.push({ title: `Stock (${stockRows.length})`, changes: stockRows });
  if (other.length) groups.push({ title: "Sizes and pieces", changes: other });
  return groups;
}

function imageChanges(b: Obj, a: Obj): Change[] {
  const urls = (o: Obj) => ((o.images as { url: string }[] | undefined) ?? []).map((i) => i.url);
  if (!("images" in a) || !("images" in b)) return [];
  const x = urls(b), y = urls(a);
  const added = y.filter((u) => !x.includes(u)).length, removed = x.filter((u) => !y.includes(u)).length;
  const reordered = !added && !removed && x.join() !== y.join();
  return [added && { label: "Photos", note: `${added} added`, kind: "add" as const }, removed && { label: "Photos", note: `${removed} removed`, kind: "remove" as const }, reordered && { label: "Photos", note: "reordered", kind: "change" as const }].filter(Boolean) as Change[];
}

export function describeChanges(entity: string, before: unknown, after: unknown): ChangeGroup[] {
  if (!after || typeof after !== "object") return [];
  const a = after as Obj, b = (before && typeof before === "object" ? before : {}) as Obj;
  if (!before) return [{ title: "Created", changes: Object.keys(a).filter((k) => !SKIP.has(k) && a[k] != null && a[k] !== "").slice(0, 12).map((k) => ({ label: human(k), to: show(k, a[k]), kind: "add" as const })) }];
  const groups: ChangeGroup[] = [];
  const fields = fieldChanges(b, a);
  if (fields.length) groups.push({ title: "Details", changes: fields });
  if (entity === "product") {
    const img = imageChanges(b, a);
    if (img.length) groups.push({ title: "Photos", changes: img });
    groups.push(...variantChanges(b, a));
  }
  return groups;
}

export const changeCount = (g: ChangeGroup[]) => g.reduce((n, x) => n + x.changes.length, 0);
