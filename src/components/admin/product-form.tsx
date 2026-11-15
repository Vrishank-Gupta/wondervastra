"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, Circle, Loader2, Plus, Star, Trash2, Upload, X } from "lucide-react";
import { saveProduct } from "@/app/admin/actions";
import { COLOURS, SIZE_SETS, TYPICAL_HEIGHTS, autoShortDescription, colourHex, presetFor, type SizeSet } from "@/lib/listing-presets";
import { Panel } from "./ui";

type Variant = { id?: string; sku: string; option1: string; option2: string; colorHex: string; price: string; mrp?: string; minPrice?: string; stock: string; active: boolean };
export type ProductFormData = {
  id?: string; name: string; slug: string; shortDescription: string; description: string; categoryId: string; brandId: string; status: "draft" | "active" | "archived";
  price: string; compareAtPrice: string; tags: string; featured: boolean; material: string; care: string; sizeGuide: string;
  option1Label: string; option2Label: string; deliveryMode: "free" | "flat"; deliveryCharge: string; codAllowed: boolean; returnable: boolean;
  forceOutOfStock: boolean; comingSoon: boolean; launchNote: string; showStockCount: boolean; maxPerOrder: string; maxPerCustomer: string; lowStockThreshold: string; minPieces?: string; comboAbove?: string; hsnCode: string; seoTitle: string; seoDescription: string;
  images: { url: string; alt: string }[]; variants: Variant[];
  /** Height in cm per size, e.g. { "4–6 Y": "104–116" }. */
  sizeHeights: Record<string, string>;
};
const paise = (s: string) => Math.round(Number(s) * 100);
const optInt = (s: string) => (s.trim() ? Math.floor(Number(s)) : null);
const FREE = "Free size", PLAIN = "Default";
const key = (size: string, colour: string) => `${size}|${colour}`;
const uniq = (xs: string[]) => [...new Set(xs)];
const tagList = (s: string) => s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input type="checkbox" className="mt-0.5 size-4 accent-ink" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm"><b>{label}</b>{hint && <span className="block text-xs text-ink-soft">{hint}</span>}</span>
    </label>
  );
}
/** A tappable choice. Big enough for a thumb, clearly on or off. */
function Chip({ on, onClick, children, label, swatch }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string; swatch?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${on ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}>
      {swatch && <span className="size-4 shrink-0 rounded-full border border-black/15" style={{ background: swatch }} aria-hidden />}
      {children}
      {on && <Check size={14} aria-hidden />}
    </button>
  );
}
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-sm border border-line bg-white p-4">
      <h2 className="flex items-baseline gap-2 font-sans text-base font-semibold tracking-normal">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs text-white">{n}</span>{title}
      </h2>
      {hint && <p className="mt-0.5 pl-8 text-xs text-ink-soft">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ProductForm({ initial, categories, brands }: { initial: ProductFormData; categories: { id: string; name: string }[]; brands: { id: string; name: string; isHouse: boolean }[] }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) => setF((x) => ({ ...x, [k]: v }));

  // Sizes × colours is the model the seller thinks in; variants are derived from it on save.
  const live = initial.variants.filter((v) => v.active).length ? initial.variants.filter((v) => v.active) : initial.variants;
  const [sizes, setSizes] = useState<string[]>(() => uniq(live.map((v) => v.option1)).filter((s) => s !== FREE));
  const [colours, setColours] = useState<{ name: string; hex: string }[]>(() =>
    uniq(live.map((v) => v.option2)).filter((c) => c !== PLAIN).map((c) => ({ name: c, hex: live.find((v) => v.option2 === c)?.colorHex || colourHex(c) })));
  const [stock, setStock] = useState<Record<string, string>>(() => Object.fromEntries(initial.variants.map((v) => [key(v.option1, v.option2), v.active ? v.stock : "0"])));
  const [meta, setMeta] = useState<Record<string, { id?: string; sku: string; price: string; mrp: string; minPrice: string }>>(() => Object.fromEntries(initial.variants.map((v) => [key(v.option1, v.option2), { id: v.id, sku: v.sku, price: v.price, mrp: v.mrp ?? "", minPrice: v.minPrice ?? "" }])));
  const [customSize, setCustomSize] = useState("");
  const [customColour, setCustomColour] = useState("");
  const [fillAll, setFillAll] = useState("");
  // Kids' sizes carry a height in cm too. New listings start from typical heights; the seller corrects them to the brand's chart.
  const [heights, setHeights] = useState<Record<string, string>>(() => ({ ...(initial.sizeHeights ?? {}) }));
  const heightOf = (s: string) => heights[s] ?? (initial.id ? "" : TYPICAL_HEIGHTS[s] ?? "");

  const category = categories.find((c) => c.id === f.categoryId);
  const preset = useMemo(() => presetFor(category?.name ?? ""), [category?.name]);
  const tags = tagList(f.tags);
  const audiences = preset.audiences ?? [];
  const chosenAudience = audiences.filter((a) => tags.includes(a.tag));
  // Size chips on offer: the set(s) that fit this category and audience, plus anything already chosen.
  const sizeSets: SizeSet[] = chosenAudience.length ? uniq(chosenAudience.map((a) => a.sizes)) as SizeSet[] : preset.audiences ? ["baby", "kids"] : [preset.sizes];
  const sizeChoices = uniq([...sizeSets.flatMap((s) => [...SIZE_SETS[s]]), ...sizes]).filter((s) => s !== FREE);
  const colourChoices = [...COLOURS, ...colours.filter((c) => !COLOURS.some((k) => k.name === c.name))];

  const S = sizes.length ? sizes : [FREE];
  const C = colours.length ? colours.map((c) => c.name) : [PLAIN];
  const totalStock = C.reduce((a, c) => a + S.reduce((b, s) => b + Number(stock[key(s, c)] || 0), 0), 0);

  function chooseCategory(id: string) {
    const p = presetFor(categories.find((c) => c.id === id)?.name ?? "");
    setF((x) => ({
      ...x, categoryId: id,
      material: x.material || p.material, care: x.care || p.care, hsnCode: x.hsnCode || p.hsn,
      tags: uniq([...tagList(x.tags), ...p.tags]).join(", "),
    }));
    if (!sizes.length && !p.audiences) setSizes([...SIZE_SETS[p.sizes]].filter((s) => s !== FREE));
  }
  function toggleAudience(tag: string) {
    const on = tags.includes(tag);
    const next = on ? tags.filter((t) => t !== tag) : [...tags, tag];
    set("tags", next.join(", "));
    const a = audiences.find((x) => x.tag === tag);
    // First audience picked fills in its usual sizes; the seller can untick any.
    if (!on && a && !sizes.length) setSizes([...SIZE_SETS[a.sizes]]);
  }
  const toggleSize = (s: string) => setSizes((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : sizeChoices.filter((c) => c === s || xs.includes(c)).concat(xs.filter((x) => !sizeChoices.includes(x)))));
  const toggleColour = (c: { name: string; hex: string }) => setColours((xs) => (xs.some((x) => x.name === c.name) ? xs.filter((x) => x.name !== c.name) : [...xs, c]));
  function addCustomSize() { const s = customSize.trim(); if (s && !sizes.includes(s)) setSizes([...sizes, s]); setCustomSize(""); }
  function addCustomColour() { const c = customColour.trim(); if (c && !colours.some((x) => x.name.toLowerCase() === c.toLowerCase())) setColours([...colours, { name: c, hex: colourHex(c) }]); setCustomColour(""); }
  function applyFillAll() { if (fillAll.trim() === "") return; setStock((st) => ({ ...st, ...Object.fromEntries(C.flatMap((c) => S.map((s) => [key(s, c), fillAll]))) })); }

  async function upload(files: FileList | File[]) {
    setUploading(true); setMsg(null);
    const form = new FormData();
    Array.from(files).forEach((x) => form.append("files", x));
    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) return setMsg({ ok: false, text: json.error ?? "Upload failed." });
    setF((x) => ({ ...x, images: [...x.images, ...json.urls.map((url: string) => ({ url, alt: x.name }))] }));
  }
  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= f.images.length) return;
    const next = [...f.images];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    set("images", next);
  };

  const brandName = brands.find((b) => b.id === f.brandId)?.name;
  const missing = [
    !f.images.length && "a photo",
    !f.categoryId && "a category",
    !f.name.trim() && "a name",
    !(Number(f.price) > 0) && "a price",
    totalStock === 0 && !f.comingSoon && "stock",
  ].filter(Boolean) as string[];

  async function submit(status?: ProductFormData["status"]) {
    if (status === "active" && missing.length) return setMsg({ ok: false, text: `To publish, add ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.` });
    const badHeight = S.find((sz) => heightOf(sz).trim() && !/^\d{2,3}(\s*[-–]\s*\d{2,3})?$/.test(heightOf(sz).trim()));
    if (badHeight) { document.querySelector<HTMLInputElement>(`[aria-label="Height for ${badHeight} (cm)"]`)?.focus(); return setMsg({ ok: false, text: `The height for ${badHeight} should be a number in cm, like 104 or 104–116.` }); }
    setBusy(true); setMsg(null);
    const variants = C.flatMap((c) => S.map((s) => {
      const m = meta[key(s, c)];
      return { id: m?.id, sku: m?.sku || null, option1: s, option2: c, colorHex: colours.find((x) => x.name === c)?.hex || null, price: m?.price ? paise(m.price) : null, mrp: m?.mrp ? paise(m.mrp) : null, minPrice: m?.minPrice ? paise(m.minPrice) : null, stock: Number(stock[key(s, c)] || 0), active: true };
    }));
    const r = await saveProduct({
      id: f.id, name: f.name, slug: f.slug || undefined,
      shortDescription: f.shortDescription || autoShortDescription({ brand: brandName, name: f.name, colours: C, sizes: S, material: f.material }) || null,
      description: f.description || null, categoryId: f.categoryId, brandId: f.brandId || null, status: status ?? f.status,
      price: paise(f.price), compareAtPrice: f.compareAtPrice ? paise(f.compareAtPrice) : null, tags: tagList(f.tags), featured: f.featured,
      material: f.material || null, care: f.care || null, sizeGuide: f.sizeGuide || null, option1Label: f.option1Label, option2Label: f.option2Label,
      deliveryMode: f.deliveryMode, deliveryCharge: paise(f.deliveryCharge || "0"), codAllowed: f.codAllowed, returnable: f.returnable, forceOutOfStock: f.forceOutOfStock, comingSoon: f.comingSoon, launchNote: f.launchNote || null, showStockCount: f.showStockCount,
      maxPerOrder: optInt(f.maxPerOrder), maxPerCustomer: optInt(f.maxPerCustomer), lowStockThreshold: Number(f.lowStockThreshold || 0), minPieces: Math.max(1, Number(f.minPieces || 1)), comboAbove: f.comboAbove ? paise(f.comboAbove) : null, hsnCode: f.hsnCode || null, seoTitle: f.seoTitle || null, seoDescription: f.seoDescription || null,
      images: f.images, variants,
      sizeHeights: Object.fromEntries(S.map((s) => [s, heightOf(s).trim()]).filter(([, h]) => h)),
    });
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: r.error });
    if (status) set("status", status);
    setMsg({ ok: true, text: status === "active" ? `Published. ${r.message && r.message !== "Saved." ? r.message : "It's live in your store."}` : r.message ?? "Saved." });
    if (!f.id && r.id) router.replace(`/admin/products/${r.id}`);
    else router.refresh();
  }

  const discount = f.compareAtPrice && f.price && Number(f.compareAtPrice) > Number(f.price) ? Math.round((1 - Number(f.price) / Number(f.compareAtPrice)) * 100) : 0;
  const isLive = f.status === "active";
  const actions = () => (
    <div className="flex gap-2 [&>*]:flex-1 lg:flex-wrap lg:[&>*]:flex-none">
      {/* Saving waits for photo uploads to finish, so a just-added photo is never left out. */}
      <button type="submit" disabled={busy || uploading} className="btn btn-white btn-sm">{(busy || uploading) && <Loader2 size={14} className="animate-spin" aria-hidden />}{uploading ? "Uploading photos…" : isLive ? "Save changes" : "Save draft"}</button>
      {!isLive && <button type="button" disabled={busy || uploading} className="btn btn-primary btn-sm" onClick={() => submit("active")}>Publish</button>}
      {isLive && <button type="button" disabled={busy || uploading} className="btn btn-white btn-sm" onClick={() => submit("draft")}>Unpublish</button>}
    </div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid grid-cols-1 gap-4 pb-24 lg:grid-cols-3 lg:pb-0">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        <Step n={1} title="Photos" hint="The first photo is the cover. Clear photos on a plain background sell best.">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); upload(e.dataTransfer.files); } }}>
            {f.images.map((im, i) => (
              <div key={im.url + i} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { if (drag != null && !e.dataTransfer.files.length) { e.stopPropagation(); moveImage(drag, i); setDrag(null); } }}
                className="group relative aspect-[4/5] cursor-move overflow-hidden rounded-sm border border-line bg-ivory">
                <Image src={im.url} alt={im.alt} fill sizes="160px" className="object-cover" />
                {i === 0 && <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded-full bg-sand px-1.5 text-[10px] font-medium"><Star size={9} aria-hidden /> Cover</span>}
                {im.url.startsWith("/seed/") && <span className="absolute top-1 right-1 rounded-full bg-gold px-1.5 text-[10px] font-medium text-white">Sample</span>}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink/70 p-1 text-white">
                  <button type="button" aria-label="Move earlier" onClick={() => moveImage(i, i - 1)}><ArrowLeft size={15} /></button>
                  <button type="button" aria-label="Remove image" onClick={() => set("images", f.images.filter((_, n) => n !== i))}><Trash2 size={15} /></button>
                  <button type="button" aria-label="Move later" onClick={() => moveImage(i, i + 1)}><ArrowRight size={15} /></button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-ink/40 bg-white text-xs font-medium hover:border-ink">
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}{uploading ? "Uploading" : "Add photos"}
            </button>
            <button type="button" onClick={() => camRef.current?.click()} disabled={uploading} className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-ink/40 bg-white text-xs font-medium hover:border-ink md:hidden">
              <Camera aria-hidden />Take photo
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden aria-label="Take a photo" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
          <p className="mt-2 text-xs text-ink-soft">Pick several at once. JPG, PNG, WebP or HEIC, up to 10 MB each. Photos are resized and location data is removed automatically. {f.images.some((i) => i.url.startsWith("/seed/")) && <b className="text-ink">Photos marked “Sample” are placeholders: replace them with your own.</b>}</p>
        </Step>

        <Step n={2} title="What is it?">
          <fieldset>
            <legend className="label">Category</legend>
            <div className="flex flex-wrap gap-2">{categories.map((c) => <Chip key={c.id} on={f.categoryId === c.id} onClick={() => chooseCategory(c.id)}>{c.name}</Chip>)}</div>
          </fieldset>
          {audiences.length > 0 && (
            <fieldset className="mt-4">
              <legend className="label">Who is it for? <span className="font-normal text-ink-soft">(pick one or more)</span></legend>
              <div className="flex flex-wrap gap-2">{audiences.map((a) => <Chip key={a.tag} on={tags.includes(a.tag)} onClick={() => toggleAudience(a.tag)}>{a.label}</Chip>)}</div>
            </fieldset>
          )}
          <fieldset className="mt-4">
            <legend className="label">Brand</legend>
            <div className="flex flex-wrap gap-2">
              {brands.map((b) => <Chip key={b.id} on={f.brandId === b.id} onClick={() => set("brandId", f.brandId === b.id ? "" : b.id)}>{b.name}{b.isHouse ? " (ours)" : ""}</Chip>)}
              <a href="/admin/brands" className="inline-flex min-h-10 items-center gap-1 rounded-full border border-dashed border-ink/40 px-3.5 text-sm font-medium hover:border-ink"><Plus size={14} aria-hidden /> New brand</a>
            </div>
          </fieldset>
          <div className="mt-4">
            <label className="label" htmlFor="name">Name</label>
            <input id="name" className="input" required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={preset.names[0] ? `e.g. ${preset.names[0]}` : "e.g. Thermal Set"} />
            {preset.names.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs"><span className="text-ink-soft">Quick pick:</span>
                {preset.names.map((n) => <button key={n} type="button" onClick={() => set("name", n)} className="rounded-full bg-sand-soft px-2.5 py-1 font-medium hover:bg-sand">{n}</button>)}
              </div>
            )}
            {brandName && f.name && <p className="mt-1 text-xs text-ink-soft">Shown in the store as <b>{brandName} {f.name}</b></p>}
          </div>
        </Step>

        <Step n={3} title="Price">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="price">Selling price ₹</label><input id="price" className="input" type="number" inputMode="decimal" min="1" step="0.01" required value={f.price} onChange={(e) => set("price", e.target.value)} /></div>
            <div><label className="label" htmlFor="mrp">MRP ₹ <span className="font-normal text-ink-soft">(printed on tag)</span></label><input id="mrp" className="input" type="number" inputMode="decimal" min="1" step="0.01" value={f.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} /></div>
          </div>
          {discount > 0 && <p className="mt-2 text-sm font-medium text-pine">Buyers see {discount}% off MRP</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["free", "flat"] as const).map((m) => (
              <label key={m} className={`cursor-pointer rounded-sm border p-2 text-center text-sm font-medium ${f.deliveryMode === m ? "border-ink bg-sand-soft" : "border-line"}`}>
                <input type="radio" name="dm" className="sr-only" checked={f.deliveryMode === m} onChange={() => set("deliveryMode", m)} />{m === "free" ? "Free delivery" : "Charge delivery"}
              </label>
            ))}
          </div>
          {f.deliveryMode === "flat" && <div className="mt-2"><label className="label" htmlFor="dc">Delivery charge ₹</label><input id="dc" className="input" type="number" inputMode="numeric" min="0" step="1" required value={f.deliveryCharge} onChange={(e) => set("deliveryCharge", e.target.value)} /></div>}
        </Step>

        <Step n={4} title="Sizes & colours" hint="Tap everything you have. Leave colours empty if there's only one.">
          <fieldset>
            <legend className="label">{f.option1Label}s</legend>
            <div className="flex flex-wrap gap-2">
              {sizeChoices.map((s) => <Chip key={s} on={sizes.includes(s)} onClick={() => toggleSize(s)}>{s}</Chip>)}
              <span className="inline-flex items-center gap-1">
                <input aria-label="Other size" className="input min-h-10 w-28 py-1.5 text-sm" placeholder="Other size" value={customSize} onChange={(e) => setCustomSize(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSize(); } }} />
                <button type="button" aria-label="Add size" className="grid size-10 place-items-center rounded-full border border-line hover:border-ink" onClick={addCustomSize}><Plus size={16} /></button>
              </span>
            </div>
          </fieldset>
          {sizes.length > 0 && (preset.kind === "kids" || sizes.some((s) => heightOf(s))) && (
            <fieldset className="mt-4">
              <legend className="label">Child&apos;s height for each size (cm)</legend>
              <p className="mb-2 text-xs text-ink-soft">Shown under each size, so parents can pick by height as well as age. Use the brand&apos;s size chart, e.g. 104–116. Leave blank to show age only.</p>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-sm">
                    <span className="font-medium whitespace-nowrap">{s}</span>
                    <input aria-label={`Height for ${s} (cm)`} className="input w-24 px-2 py-1 text-sm" inputMode="numeric" placeholder={TYPICAL_HEIGHTS[s] ?? "cm"} value={heightOf(s)} onChange={(e) => setHeights((h) => ({ ...h, [s]: e.target.value.replace(/[^\d–-]/g, "") }))} />
                    <span className="text-xs text-ink-soft">cm</span>
                  </label>
                ))}
              </div>
              {sizes.some((s) => !heightOf(s) && TYPICAL_HEIGHTS[s]) && <button type="button" className="mt-2 text-sm font-medium underline" onClick={() => setHeights((h) => ({ ...h, ...Object.fromEntries(sizes.filter((s) => !heightOf(s) && TYPICAL_HEIGHTS[s]).map((s) => [s, TYPICAL_HEIGHTS[s]])) }))}>Fill typical heights for the empty ones</button>}
            </fieldset>
          )}
          <fieldset className="mt-4">
            <legend className="label">{f.option2Label}s</legend>
            <div className="flex flex-wrap gap-2">
              {colourChoices.map((c) => <Chip key={c.name} swatch={c.hex} on={colours.some((x) => x.name === c.name)} onClick={() => toggleColour(c)}>{c.name}</Chip>)}
              <span className="inline-flex items-center gap-1">
                <input aria-label="Other colour" className="input min-h-10 w-32 py-1.5 text-sm" placeholder="Other colour" value={customColour} onChange={(e) => setCustomColour(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomColour(); } }} />
                <button type="button" aria-label="Add colour" className="grid size-10 place-items-center rounded-full border border-line hover:border-ink" onClick={addCustomColour}><Plus size={16} /></button>
              </span>
            </div>
          </fieldset>
        </Step>

        <Step n={5} title={`Stock: ${totalStock} pieces`} hint="How many pieces of each you have right now. 0 shows as sold out.">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div><label className="label text-xs" htmlFor="fill">Same for all</label><input id="fill" className="input w-24 py-1.5" type="number" inputMode="numeric" min="0" value={fillAll} onChange={(e) => setFillAll(e.target.value)} /></div>
            <button type="button" className="btn btn-white btn-sm" onClick={applyFillAll}>Fill all</button>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm [&_td]:p-1 [&_th]:p-1 [&_th]:text-xs [&_th]:font-medium [&_th]:text-ink-soft">
              <thead><tr><th className="text-left">{C[0] === PLAIN ? "" : f.option2Label}</th>{S.map((s) => <th key={s} className="text-center whitespace-nowrap">{s === FREE ? "Pieces" : s}</th>)}</tr></thead>
              <tbody>
                {C.map((c) => (
                  <tr key={c}>
                    <th scope="row" className="pr-2 text-left whitespace-nowrap">
                      {c !== PLAIN && <span className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded-full border border-black/15" style={{ background: colours.find((x) => x.name === c)?.hex }} aria-hidden />{c}</span>}
                    </th>
                    {S.map((s) => (
                      <td key={s}><input aria-label={`Stock for ${[c !== PLAIN && c, s !== FREE && s].filter(Boolean).join(" ") || "this item"}`} className="input w-16 px-2 py-1.5 text-center" type="number" inputMode="numeric" min="0"
                        value={stock[key(s, c)] ?? ""} placeholder="0" onChange={(e) => setStock((st) => ({ ...st, [key(s, c)]: e.target.value }))} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Step>

        <details className="group rounded-sm border border-line bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-semibold">
            <span>More options <span className="block text-xs font-normal text-ink-soft">Description, care, returns, limits, codes and link sharing. All optional, with defaults filled in.</span></span>
            <ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-4 border-t border-line p-4">
            <div><label className="label" htmlFor="short">Short description <span className="font-normal text-ink-soft">(written for you if left blank)</span></label><input id="short" className="input" maxLength={200} value={f.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} placeholder={autoShortDescription({ brand: brandName, name: f.name, colours: C, sizes: S, material: f.material })} /></div>
            <div><label className="label" htmlFor="desc">Full description</label><textarea id="desc" className="input" rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="mat">Material</label><input id="mat" className="input" value={f.material} onChange={(e) => set("material", e.target.value)} /></div>
              <div><label className="label" htmlFor="hsn">HSN code <span className="font-normal text-ink-soft">(for GST bills, already filled in)</span></label><input id="hsn" className="input" value={f.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} /></div>
            </div>
            <div><label className="label" htmlFor="care">Care instructions</label><textarea id="care" className="input" rows={2} value={f.care} onChange={(e) => set("care", e.target.value)} /></div>
            <div><label className="label" htmlFor="sg">Size guide</label><textarea id="sg" className="input" rows={2} value={f.sizeGuide} onChange={(e) => set("sizeGuide", e.target.value)} /></div>
            <div>
              <label className="label" htmlFor="tags">Extra search words <span className="font-normal text-ink-soft">(separate with commas)</span></label>
              <input id="tags" className="input" placeholder="winter, value, new" value={f.tags} onChange={(e) => set("tags", e.target.value)} />
              <p className="mt-1 text-xs text-ink-soft">“new” and “bestseller” add badges and feed the homepage rails.</p>
              <Toggle label="Feature on homepage" checked={f.featured} onChange={(v) => set("featured", v)} />
            </div>
            <div>
              <Toggle label="Allow cash on delivery" checked={f.codAllowed} onChange={(v) => set("codAllowed", v)} />
              <Toggle label="Returnable" checked={f.returnable} onChange={(v) => set("returnable", v)} />
              <Toggle label="Coming soon" hint="Shown in the store with a Coming soon badge but can't be bought. Buyers can sign up, and they're told when you switch this off." checked={f.comingSoon} onChange={(v) => set("comingSoon", v)} />
              {f.comingSoon && <div className="mb-2"><label className="label text-xs" htmlFor="ln">Launch note (optional)</label><input id="ln" className="input" maxLength={80} placeholder="e.g. Launching in December" value={f.launchNote} onChange={(e) => set("launchNote", e.target.value)} /></div>}
              <Toggle label="Mark out of stock" hint="Hides the buy button but keeps the page live, with Notify Me on" checked={f.forceOutOfStock} onChange={(v) => set("forceOutOfStock", v)} />
              <Toggle label="Show pieces available" hint="e.g. “12 pieces available”" checked={f.showStockCount} onChange={(v) => set("showStockCount", v)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label text-xs" htmlFor="mpo">Most pieces in one order</label><input id="mpo" className="input" type="number" min="1" placeholder="No limit" value={f.maxPerOrder} onChange={(e) => set("maxPerOrder", e.target.value)} /></div>
              <div><label className="label text-xs" htmlFor="mpc">Most pieces one customer can buy, ever</label><input id="mpc" className="input" type="number" min="1" placeholder="No limit" value={f.maxPerCustomer} onChange={(e) => set("maxPerCustomer", e.target.value)} /></div>
              <div><label className="label text-xs" htmlFor="lst">Say “only a few left” below</label><input id="lst" className="input" type="number" min="0" value={f.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} /></div>
            </div>
            <fieldset className="rounded-sm border border-line p-3">
              <legend className="px-1 text-sm font-semibold">Sold in sets <span className="font-normal text-ink-soft">(optional, e.g. kids&apos; wear sold in 2s)</span></legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label text-xs" htmlFor="minp">Fewest pieces per order</label><input id="minp" className="input" type="number" min="1" placeholder="1" value={f.minPieces ?? ""} onChange={(e) => set("minPieces", e.target.value)} /></div>
                <div><label className="label text-xs" htmlFor="cabove">…but any number when the whole cart is above ₹</label><input id="cabove" className="input" type="number" min="1" placeholder="Never" value={f.comboAbove ?? ""} onChange={(e) => set("comboAbove", e.target.value)} /></div>
              </div>
              <p className="mt-2 text-xs text-ink-soft">Pieces of this listing count together, any sizes. Leave empty to sell single pieces.</p>
            </fieldset>
            <div>
              <p className="label">Different price, MRP, minimum price or SKU for one size or colour <span className="font-normal text-ink-soft">(optional; leave empty to use the prices above. Min price is used only when you run a “minimum price” sale. SKUs are made for you)</span></p>
              <div className="max-h-72 overflow-auto rounded-sm border border-line">
                <table className="w-full text-sm [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-ink-soft">
                  <thead><tr><th>Variant</th><th>Price ₹</th><th>MRP ₹</th><th title="Used only when you run a minimum-price sale">Min price ₹</th><th>SKU</th></tr></thead>
                  <tbody>
                    {C.flatMap((c) => S.map((s) => {
                      const k = key(s, c); const m = meta[k] ?? { sku: "", price: "", mrp: "", minPrice: "" };
                      const label = [c !== PLAIN && c, s !== FREE && s].filter(Boolean).join(" · ") || "This item";
                      return (
                        <tr key={k} className="border-t border-line">
                          <td className="whitespace-nowrap">{label}</td>
                          <td><input aria-label={`Price for ${label}`} className="input w-24 px-2 py-1" type="number" min="1" step="0.01" placeholder={f.price || "Same"} value={m.price} onChange={(e) => setMeta((x) => ({ ...x, [k]: { ...m, price: e.target.value } }))} /></td>
                          <td><input aria-label={`MRP for ${label}`} className="input w-24 px-2 py-1" type="number" min="1" step="0.01" placeholder={f.compareAtPrice || "Same"} value={m.mrp} onChange={(e) => setMeta((x) => ({ ...x, [k]: { ...m, mrp: e.target.value } }))} /></td>
                          <td><input aria-label={`Min price for ${label}`} className="input w-24 px-2 py-1" type="number" min="1" step="0.01" placeholder="None" value={m.minPrice} onChange={(e) => setMeta((x) => ({ ...x, [k]: { ...m, minPrice: e.target.value } }))} /></td>
                          <td><input aria-label={`SKU for ${label}`} className="input w-36 px-2 py-1 font-mono text-xs" placeholder="Auto" value={m.sku} onChange={(e) => setMeta((x) => ({ ...x, [k]: { ...m, sku: e.target.value } }))} /></td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div><label className="label text-xs" htmlFor="o1">Name for “size”</label><input id="o1" className="input py-1.5" value={f.option1Label} onChange={(e) => set("option1Label", e.target.value)} /></div>
                <div><label className="label text-xs" htmlFor="o2">Name for “colour”</label><input id="o2" className="input py-1.5" value={f.option2Label} onChange={(e) => set("option2Label", e.target.value)} /></div>
              </div>
            </div>
            <div className="space-y-3">
              <div><label className="label" htmlFor="slug">Web address of this listing</label><div className="flex items-center gap-1 text-sm"><span className="text-ink-soft">/p/</span><input id="slug" className="input" value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="made from the name" /></div>
                {f.id && <p className="mt-1 text-xs font-medium text-clay">Changing this breaks links already shared on Instagram or WhatsApp.</p>}</div>
              <div><label className="label" htmlFor="st">Title on Google and WhatsApp previews <span className="font-normal text-ink-soft">(optional)</span></label><input id="st" className="input" maxLength={70} value={f.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} placeholder={f.name} /></div>
              <div><label className="label" htmlFor="sd">Description on Google and WhatsApp previews <span className="font-normal text-ink-soft">(optional)</span></label><textarea id="sd" className="input" rows={2} maxLength={170} value={f.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} placeholder={f.shortDescription} /></div>
            </div>
          </div>
        </details>
      </div>

      <div className="space-y-4">
        <Panel title={isLive ? "Live in your store" : f.status === "archived" ? "Archived" : "Draft"} className="lg:sticky lg:top-4">
          <ul className="mb-3 space-y-1 text-sm" aria-label="Ready to publish">
            {[["Photo", f.images.length > 0], ["Category", Boolean(f.categoryId)], ["Name", Boolean(f.name.trim())], ["Price", Number(f.price) > 0], ["Stock", totalStock > 0 || f.comingSoon]].map(([label, ok]) => (
              <li key={label as string} className={`flex items-center gap-2 ${ok ? "" : "text-ink-soft"}`}>
                {ok ? <Check size={15} className="text-pine" aria-hidden /> : <Circle size={15} aria-hidden />}{label as string}{!ok && <span className="sr-only"> (missing)</span>}
              </li>
            ))}
          </ul>
          {/* One block: pinned to the bottom of the screen on phones (always in reach), in this panel on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:border-0 lg:p-0">
            {msg && <p className={`mb-2 flex items-start justify-between gap-2 rounded-sm p-2 text-sm font-medium ${msg.ok ? "bg-pine-soft" : "bg-clay-soft"}`} role={msg.ok ? "status" : "alert"}>{msg.text}<button type="button" aria-label="Dismiss message" className="lg:hidden" onClick={() => setMsg(null)}><X size={16} /></button></p>}
            {actions()}
          </div>
          {f.id && isLive && <a className="mt-3 inline-flex text-sm font-medium underline underline-offset-4" href={`/p/${f.slug}`} target="_blank" rel="noreferrer">View in store</a>}
        </Panel>
      </div>

    </form>
  );
}
