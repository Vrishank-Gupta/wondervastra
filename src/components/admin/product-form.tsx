"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Plus, Star, Trash2, Upload, Wand2 } from "lucide-react";
import { saveProduct } from "@/app/admin/actions";
import { Panel } from "./ui";

type Variant = { id?: string; sku: string; option1: string; option2: string; colorHex: string; price: string; stock: string; active: boolean };
export type ProductFormData = {
  id?: string; name: string; slug: string; shortDescription: string; description: string; categoryId: string; brandId: string; status: "draft" | "active" | "archived";
  price: string; compareAtPrice: string; tags: string; featured: boolean; material: string; care: string; sizeGuide: string;
  option1Label: string; option2Label: string; deliveryMode: "free" | "flat"; deliveryCharge: string; codAllowed: boolean; returnable: boolean;
  forceOutOfStock: boolean; comingSoon: boolean; launchNote: string; showStockCount: boolean; maxPerOrder: string; maxPerCustomer: string; lowStockThreshold: string; hsnCode: string; seoTitle: string; seoDescription: string;
  images: { url: string; alt: string }[]; variants: Variant[];
};
const paise = (s: string) => Math.round(Number(s) * 100);
const optInt = (s: string) => (s.trim() ? Math.floor(Number(s)) : null);

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input type="checkbox" className="mt-0.5 size-4 accent-ink" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm"><b>{label}</b>{hint && <span className="block text-xs text-ink-soft">{hint}</span>}</span>
    </label>
  );
}

export function ProductForm({ initial, categories, brands }: { initial: ProductFormData; categories: { id: string; name: string }[]; brands: { id: string; name: string; isHouse: boolean }[] }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sizesText, setSizesText] = useState("");
  const [colorsText, setColorsText] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) => setF((x) => ({ ...x, [k]: v }));
  const setVar = (i: number, patch: Partial<Variant>) => set("variants", f.variants.map((v, n) => (n === i ? { ...v, ...patch } : v)));

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
  const generate = () => {
    const sizes = sizesText.split(",").map((s) => s.trim()).filter(Boolean);
    const colors = colorsText.split(",").map((s) => s.trim()).filter(Boolean);
    const S = sizes.length ? sizes : ["Free size"];
    const C = colors.length ? colors : ["Default"];
    const existing = f.variants;
    const next: Variant[] = [];
    for (const c of C) for (const s of S) {
      next.push(existing.find((v) => v.option1 === s && v.option2 === c) ?? { sku: "", option1: s, option2: c, colorHex: "", price: "", stock: "0", active: true });
    }
    set("variants", next);
  };

  async function submit(status?: ProductFormData["status"]) {
    setBusy(true); setMsg(null);
    const r = await saveProduct({
      id: f.id, name: f.name, slug: f.slug || undefined, shortDescription: f.shortDescription || null, description: f.description || null, categoryId: f.categoryId, brandId: f.brandId || null, status: status ?? f.status,
      price: paise(f.price), compareAtPrice: f.compareAtPrice ? paise(f.compareAtPrice) : null, tags: f.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), featured: f.featured,
      material: f.material || null, care: f.care || null, sizeGuide: f.sizeGuide || null, option1Label: f.option1Label, option2Label: f.option2Label,
      deliveryMode: f.deliveryMode, deliveryCharge: paise(f.deliveryCharge || "0"), codAllowed: f.codAllowed, returnable: f.returnable, forceOutOfStock: f.forceOutOfStock, comingSoon: f.comingSoon, launchNote: f.launchNote || null, showStockCount: f.showStockCount,
      maxPerOrder: optInt(f.maxPerOrder), maxPerCustomer: optInt(f.maxPerCustomer), lowStockThreshold: Number(f.lowStockThreshold || 0), hsnCode: f.hsnCode || null, seoTitle: f.seoTitle || null, seoDescription: f.seoDescription || null,
      images: f.images,
      variants: f.variants.map((v) => ({ id: v.id, sku: v.sku || null, option1: v.option1, option2: v.option2, colorHex: v.colorHex || null, price: v.price ? paise(v.price) : null, stock: Number(v.stock || 0), active: v.active })),
    });
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: r.error });
    if (status) set("status", status);
    setMsg({ ok: true, text: r.message ?? "Saved." });
    if (!f.id && r.id) router.replace(`/admin/products/${r.id}`);
    else router.refresh();
  }

  const discount = f.compareAtPrice && f.price && Number(f.compareAtPrice) > Number(f.price) ? Math.round((1 - Number(f.price) / Number(f.compareAtPrice)) * 100) : 0;
  const totalStock = f.variants.filter((v) => v.active).reduce((a, v) => a + Number(v.stock || 0), 0);

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="min-w-0 space-y-5 xl:col-span-2">
        <Panel title="Details">
          <div className="space-y-3">
            <div><label className="label" htmlFor="name">Name</label><input id="name" className="input" required value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div><label className="label" htmlFor="short">Short description <span className="font-normal text-ink-soft">(appears under the name)</span></label><input id="short" className="input" maxLength={200} value={f.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} /></div>
            <div><label className="label" htmlFor="desc">Full description</label><textarea id="desc" className="input" rows={5} value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="mat">Material</label><input id="mat" className="input" value={f.material} onChange={(e) => set("material", e.target.value)} /></div>
              <div><label className="label" htmlFor="hsn">HSN code</label><input id="hsn" className="input" value={f.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} /></div>
            </div>
            <div><label className="label" htmlFor="care">Care instructions</label><textarea id="care" className="input" rows={2} value={f.care} onChange={(e) => set("care", e.target.value)} /></div>
            <div><label className="label" htmlFor="sg">Size guide</label><textarea id="sg" className="input" rows={2} value={f.sizeGuide} onChange={(e) => set("sizeGuide", e.target.value)} /></div>
          </div>
        </Panel>

        <Panel title="Images" actions={<span className="text-xs text-ink-soft">First image is the cover. Drag to reorder.</span>}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); upload(e.dataTransfer.files); } }}>
            {f.images.map((im, i) => (
              <div key={im.url + i} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { if (drag != null && !e.dataTransfer.files.length) { e.stopPropagation(); moveImage(drag, i); setDrag(null); } }}
                className="group relative aspect-[4/5] cursor-move overflow-hidden rounded-sm border border-line bg-ivory">
                <Image src={im.url} alt={im.alt} fill sizes="160px" className="object-cover" />
                {i === 0 && <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded-full bg-sand px-1.5 text-[10px] font-medium"><Star size={9} aria-hidden /> Cover</span>}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink/70 p-1 text-white">
                  <button type="button" aria-label="Move earlier" onClick={() => moveImage(i, i - 1)}><ArrowLeft size={15} /></button>
                  <button type="button" aria-label="Remove image" onClick={() => set("images", f.images.filter((_, n) => n !== i))}><Trash2 size={15} /></button>
                  <button type="button" aria-label="Move later" onClick={() => moveImage(i, i + 1)}><ArrowRight size={15} /></button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-ink/40/30 bg-white text-xs font-medium hover:border-ink">
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}{uploading ? "Uploading" : "Add photos"}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
          <p className="mt-2 text-xs text-ink-soft">JPG, PNG, WebP or HEIC up to 12 MB. Photos are resized and location data is removed automatically. Tip: use 4:5 portrait shots.</p>
        </Panel>

        <Panel title={`Variants & stock (${totalStock} pcs)`}>
          <div className="mb-3 grid gap-2 rounded-sm bg-ivory p-3 sm:grid-cols-[1fr_1fr_auto]">
            <div><label className="label text-xs" htmlFor="sizes">{f.option1Label} options</label><input id="sizes" className="input py-1.5" placeholder="S, M, L" value={sizesText} onChange={(e) => setSizesText(e.target.value)} /></div>
            <div><label className="label text-xs" htmlFor="colors">{f.option2Label} options</label><input id="colors" className="input py-1.5" placeholder="Pink, Black" value={colorsText} onChange={(e) => setColorsText(e.target.value)} /></div>
            <button type="button" onClick={generate} className="btn btn-white btn-sm self-end"><Wand2 size={14} aria-hidden /> Generate</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm [&_input]:min-h-0 [&_input]:rounded-sm [&_input]:px-2 [&_input]:py-1.5 [&_th]:px-1 [&_th]:py-1 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-ink-soft [&_td]:px-1 [&_td]:py-1">
              <thead><tr><th><input aria-label="Label for first option" className="input w-full text-xs" value={f.option1Label} onChange={(e) => set("option1Label", e.target.value)} /></th><th><input aria-label="Label for second option" className="input w-full text-xs" value={f.option2Label} onChange={(e) => set("option2Label", e.target.value)} /></th><th>Swatch</th><th>Stock</th><th>Price ₹ (optional)</th><th>SKU</th><th>On</th><th /></tr></thead>
              <tbody>
                {f.variants.map((v, i) => (
                  <tr key={v.id ?? i}>
                    <td><input aria-label="Size" className="input" required value={v.option1} onChange={(e) => setVar(i, { option1: e.target.value })} /></td>
                    <td><input aria-label="Colour" className="input" required value={v.option2} onChange={(e) => setVar(i, { option2: e.target.value })} /></td>
                    <td><input aria-label="Swatch colour" type="color" className="block h-8 w-10 cursor-pointer rounded border border-line" value={v.colorHex || "#dddddd"} onChange={(e) => setVar(i, { colorHex: e.target.value })} /></td>
                    <td><input aria-label="Stock" className="input w-20" type="number" min="0" required value={v.stock} onChange={(e) => setVar(i, { stock: e.target.value })} /></td>
                    <td><input aria-label="Variant price" className="input w-24" type="number" min="1" step="0.01" placeholder={f.price || "Same"} value={v.price} onChange={(e) => setVar(i, { price: e.target.value })} /></td>
                    <td><input aria-label="SKU" className="input w-32 font-mono text-xs" value={v.sku} onChange={(e) => setVar(i, { sku: e.target.value })} /></td>
                    <td><input aria-label="Variant on sale" type="checkbox" className="size-4 accent-ink" checked={v.active} onChange={(e) => setVar(i, { active: e.target.checked })} /></td>
                    <td><button type="button" aria-label="Remove variant" className="grid size-8 place-items-center hover:text-clay" onClick={() => set("variants", f.variants.filter((_, n) => n !== i))}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-white btn-sm mt-2" onClick={() => set("variants", [...f.variants, { sku: "", option1: "Free size", option2: "Default", colorHex: "", price: "", stock: "0", active: true }])}><Plus size={14} aria-hidden /> Add variant</button>
        </Panel>

        <Panel title="Search & sharing">
          <div className="space-y-3">
            <div><label className="label" htmlFor="slug">Link</label><div className="flex items-center gap-1 text-sm"><span className="text-ink-soft">/p/</span><input id="slug" className="input" value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="made from the name" /></div>
              {f.id && <p className="mt-1 text-xs font-medium text-clay">Changing this breaks links already shared on Instagram or WhatsApp.</p>}</div>
            <div><label className="label" htmlFor="st">Preview title</label><input id="st" className="input" maxLength={70} value={f.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} placeholder={f.name} /></div>
            <div><label className="label" htmlFor="sd">Preview description</label><textarea id="sd" className="input" rows={2} maxLength={170} value={f.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} placeholder={f.shortDescription} /></div>
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title="Publish">
          {msg && <p className={`mb-3 rounded-sm p-2 text-sm font-medium ${msg.ok ? "bg-pine-soft" : "bg-clay-soft"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
          <p className="mb-2 text-sm">Status: <b>{f.status === "active" ? "Live" : f.status === "draft" ? "Draft" : "Archived"}</b></p>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} className="btn btn-ink btn-sm">{busy && <Loader2 size={14} className="animate-spin" aria-hidden />}Save</button>
            {f.status !== "active" && <button type="button" disabled={busy} className="btn btn-primary btn-sm" onClick={(e) => { const form = (e.target as HTMLElement).closest("form"); if (form?.reportValidity()) submit("active"); }}>Save & publish</button>}
            {f.status === "active" && <button type="button" disabled={busy} className="btn btn-white btn-sm" onClick={() => submit("draft")}>Unpublish</button>}
          </div>
        </Panel>
        <Panel title="Organise">
          <label className="label" htmlFor="cat">Category</label>
          <select id="cat" className="input" required value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}><option value="">Choose category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="label mt-3" htmlFor="brand">Brand</label>
          <select id="brand" className="input" value={f.brandId} onChange={(e) => set("brandId", e.target.value)}>
            <option value="">No brand</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.isHouse ? " (our label)" : ""}</option>)}
          </select>
          <label className="label mt-3" htmlFor="tags">Tags <span className="font-normal text-ink-soft">(comma separated)</span></label>
          <input id="tags" className="input" placeholder="winter, everyday, value, new" value={f.tags} onChange={(e) => set("tags", e.target.value)} />
          <p className="mt-1 text-xs text-ink-soft">“new” and “bestseller” add badges and feed the homepage rails.</p>
          <div className="mt-2"><Toggle label="Feature on homepage" checked={f.featured} onChange={(v) => set("featured", v)} /></div>
        </Panel>
        <Panel title="Pricing">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="price">Selling price ₹</label><input id="price" className="input" type="number" min="1" step="0.01" required value={f.price} onChange={(e) => set("price", e.target.value)} /></div>
            <div><label className="label" htmlFor="mrp">MRP ₹</label><input id="mrp" className="input" type="number" min="1" step="0.01" value={f.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} /></div>
          </div>
          {discount > 0 && <p className="mt-2 text-sm font-medium text-pine">Shows as {discount}% off</p>}
        </Panel>
        <Panel title="Delivery">
          <div className="grid grid-cols-2 gap-2">
            {(["free", "flat"] as const).map((m) => (
              <label key={m} className={`cursor-pointer rounded-sm border p-2 text-center text-sm font-medium ${f.deliveryMode === m ? "border-ink bg-sand-soft" : "border-line"}`}>
                <input type="radio" name="dm" className="sr-only" checked={f.deliveryMode === m} onChange={() => set("deliveryMode", m)} />{m === "free" ? "Free delivery" : "Charge delivery"}
              </label>
            ))}
          </div>
          {f.deliveryMode === "flat" && <div className="mt-2"><label className="label" htmlFor="dc">Delivery charge ₹</label><input id="dc" className="input" type="number" min="0" step="1" required value={f.deliveryCharge} onChange={(e) => set("deliveryCharge", e.target.value)} /></div>}
          <div className="mt-2"><Toggle label="Allow cash on delivery" checked={f.codAllowed} onChange={(v) => set("codAllowed", v)} /><Toggle label="Returnable" checked={f.returnable} onChange={(v) => set("returnable", v)} /></div>
        </Panel>
        <Panel title="Stock display & limits">
          <Toggle label="Coming soon" hint="Shown in the store with a Coming soon badge but can't be bought. Buyers can sign up, and they're told when you switch this off." checked={f.comingSoon} onChange={(v) => set("comingSoon", v)} />
          {f.comingSoon && <div className="mb-2"><label className="label text-xs" htmlFor="ln">Launch note (optional)</label><input id="ln" className="input" maxLength={80} placeholder="e.g. Launching in December" value={f.launchNote} onChange={(e) => set("launchNote", e.target.value)} /></div>}
          <Toggle label="Mark out of stock" hint="Hides the buy button but keeps the page live, with Notify Me on" checked={f.forceOutOfStock} onChange={(v) => set("forceOutOfStock", v)} />
          <Toggle label="Show pieces available" hint="e.g. “12 pieces available”" checked={f.showStockCount} onChange={(v) => set("showStockCount", v)} />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div><label className="label text-xs" htmlFor="mpo">Max per order</label><input id="mpo" className="input" type="number" min="1" placeholder="No limit" value={f.maxPerOrder} onChange={(e) => set("maxPerOrder", e.target.value)} /></div>
            <div><label className="label text-xs" htmlFor="mpc">Max per customer</label><input id="mpc" className="input" type="number" min="1" placeholder="No limit" value={f.maxPerCustomer} onChange={(e) => set("maxPerCustomer", e.target.value)} /></div>
          </div>
          <div className="mt-2"><label className="label text-xs" htmlFor="lst">“Only few left” under</label><input id="lst" className="input" type="number" min="0" value={f.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} /></div>
        </Panel>
      </div>
    </form>
  );
}
