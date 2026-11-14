"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { deleteBrand, saveBrand } from "@/app/admin/actions";

type Brand = { id?: string; slug?: string; name: string; tagline: string; logo: string; image: string; isHouse: boolean; sortOrder: number; active: boolean; count?: number };
const NEW: Brand = { name: "", tagline: "", logo: "", image: "", isHouse: false, sortOrder: 100, active: true };

function UploadButton({ label, onUrl, onError }: { label: string; onUrl: (url: string) => void; onError: (e: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="btn btn-white btn-sm cursor-pointer">{busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />} {label}
      <input type="file" accept="image/*" hidden onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy(true);
        const form = new FormData(); form.append("files", file);
        const res = await fetch("/api/admin/upload", { method: "POST", body: form });
        const json = await res.json();
        setBusy(false);
        if (res.ok) onUrl(json.urls[0]); else onError(json.error);
      }} />
    </label>
  );
}

export function BrandManager({ brands }: { brands: Brand[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Brand | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {error && <p className="rounded-sm bg-clay-soft p-3 text-sm font-medium" role="alert">{error}</p>}
      {!edit && <button className="btn btn-primary btn-sm" onClick={() => setEdit(NEW)}><Plus size={15} aria-hidden /> Add brand</button>}
      {edit && (
        <form className="grid gap-3 rounded-sm border border-line bg-white p-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const r = await saveBrand({ id: edit.id, name: edit.name, tagline: edit.tagline || null, logo: edit.logo || null, image: edit.image || null, isHouse: edit.isHouse, sortOrder: Number(edit.sortOrder), active: edit.active });
          if (r.error) setError(r.error); else { setEdit(null); setError(""); router.refresh(); }
        }}>
          <div><label className="label" htmlFor="bn">Name</label><input id="bn" className="input" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Lux" /></div>
          <div><label className="label" htmlFor="bt">Tagline</label><input id="bt" className="input" value={edit.tagline} onChange={(e) => setEdit({ ...edit, tagline: e.target.value })} placeholder="e.g. Vests, briefs and thermals" /></div>
          <div><label className="label" htmlFor="bo">Display order</label><input id="bo" className="input" type="number" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) })} /></div>
          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
            <div>
              <span className="label">Logo <span className="font-normal text-ink-soft">(optional; the name is shown until you add one)</span></span>
              <div className="flex items-center gap-3">
                {edit.logo && <span className="relative h-12 w-20 overflow-hidden rounded-sm border border-line bg-white"><Image src={edit.logo} alt="" fill sizes="80px" className="object-contain" /></span>}
                <UploadButton label="Upload logo" onUrl={(url) => setEdit((b) => ({ ...b!, logo: url }))} onError={setError} />
                {edit.logo && <button type="button" className="text-xs underline" onClick={() => setEdit({ ...edit, logo: "" })}>Remove</button>}
              </div>
            </div>
            <div>
              <span className="label">Banner photo <span className="font-normal text-ink-soft">(optional, for the brand page)</span></span>
              <div className="flex items-center gap-3">
                {edit.image && <span className="relative h-12 w-20 overflow-hidden rounded-sm border border-line"><Image src={edit.image} alt="" fill sizes="80px" className="object-cover" /></span>}
                <UploadButton label="Upload photo" onUrl={(url) => setEdit((b) => ({ ...b!, image: url }))} onError={setError} />
                {edit.image && <button type="button" className="text-xs underline" onClick={() => setEdit({ ...edit, image: "" })}>Remove</button>}
              </div>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-0.5 size-4 accent-ink" checked={edit.isHouse} onChange={(e) => setEdit({ ...edit, isHouse: e.target.checked })} />
            <span><b>This is our own label</b><span className="block text-xs text-ink-soft">Gets its own dark section on the homepage and an “Our label” badge.</span></span></label>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" className="size-4 accent-ink" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Visible in store <span className="font-normal text-ink-soft">(hiding a brand also hides its listings)</span></label>
          <div className="flex gap-2 sm:col-span-2"><button className="btn btn-ink btn-sm">Save</button><button type="button" className="btn btn-white btn-sm" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {brands.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-sm border border-line bg-white p-3">
            <span className={`relative grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-sm border border-line px-1 text-center text-xs font-bold uppercase ${b.isHouse ? "bg-ink text-white" : ""}`}>
              {b.logo ? <Image src={b.logo} alt="" fill sizes="80px" className="object-contain p-1" /> : b.name}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{b.name}{b.isHouse && <span className="ml-2 rounded-sm bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white uppercase">Our label</span>}</p>
              <p className="text-xs text-ink-soft">
                <a className="underline" href={`/admin/products?brand=${b.id}`}>{b.count} live listing{b.count === 1 ? "" : "s"}</a>
                {!b.active && " · hidden"}{b.count === 0 && b.active && " · hidden until it has listings"}
              </p>
            </div>
            <button aria-label={`Edit ${b.name}`} className="grid size-9 place-items-center" onClick={() => setEdit(b)}><Pencil size={16} /></button>
            {confirmDelete === b.id
              ? <button className="btn btn-ink btn-sm" onClick={async () => { const r = await deleteBrand(b.id!); setConfirmDelete(null); if (r.error) setError(r.error); else router.refresh(); }}>Delete?</button>
              : <button aria-label={`Delete ${b.name}`} className="grid size-9 place-items-center hover:text-clay" onClick={() => setConfirmDelete(b.id!)}><Trash2 size={16} /></button>}
          </div>
        ))}
        {!brands.length && <p className="text-sm text-ink-soft">No brands yet. Add the brands you stock, and your own label.</p>}
      </div>
    </div>
  );
}
