"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { deleteCategory, saveCategory } from "@/app/admin/actions";

type Cat = { id?: string; name: string; tagline: string; image: string; accent: string; sortOrder: number; active: boolean; slug?: string; count?: number };
const NEW: Cat = { name: "", tagline: "", image: "", accent: "#E8DFCF", sortOrder: 100, active: true };

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Cat | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {error && <p className="rounded-sm bg-clay-soft p-3 text-sm font-medium" role="alert">{error}</p>}
      {!edit && <button className="btn btn-primary btn-sm" onClick={() => setEdit(NEW)}><Plus size={15} aria-hidden /> Add category</button>}
      {edit && (
        <form className="grid gap-3 rounded-sm border border-line bg-white p-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const r = await saveCategory({ id: edit.id, name: edit.name, tagline: edit.tagline || null, image: edit.image || null, accent: edit.accent, sortOrder: Number(edit.sortOrder), active: edit.active });
          if (r.error) setError(r.error); else { setEdit(null); setError(""); router.refresh(); }
        }}>
          <div><label className="label" htmlFor="cn">Name</label><input id="cn" className="input" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="ct">Tagline</label><input id="ct" className="input" value={edit.tagline} onChange={(e) => setEdit({ ...edit, tagline: e.target.value })} /></div>
          <div><label className="label" htmlFor="co">Display order</label><input id="co" className="input" type="number" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) })} /></div>
          <div className="sm:col-span-2">
            <span className="label">Image</span>
            <div className="flex items-center gap-3">
              {edit.image && <span className="relative h-20 w-16 overflow-hidden rounded-sm border border-line"><Image src={edit.image} alt="" fill sizes="64px" className="object-cover" /></span>}
              <label className="btn btn-white btn-sm cursor-pointer">{uploading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />} Upload
                <input type="file" accept="image/*" hidden onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  const form = new FormData(); form.append("files", file);
                  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
                  const json = await res.json();
                  setUploading(false);
                  if (res.ok) setEdit((c) => ({ ...c!, image: json.urls[0] })); else setError(json.error);
                }} />
              </label>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" className="size-4 accent-ink" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Visible in store</label>
          <div className="flex gap-2 sm:col-span-2"><button className="btn btn-ink btn-sm">Save</button><button type="button" className="btn btn-white btn-sm" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-sm border border-line bg-white p-3">
            <span className="relative h-16 w-14 shrink-0 overflow-hidden rounded-sm border border-line" style={{ background: c.accent }}>{c.image && <Image src={c.image} alt="" fill sizes="56px" className="object-cover" />}</span>
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{c.name}</p><p className="text-xs text-ink-soft">{c.count} live listing{c.count === 1 ? "" : "s"}{!c.active && " · hidden"}{c.count === 0 && c.active && " · hidden until it has listings"}</p></div>
            <button aria-label={`Edit ${c.name}`} className="grid size-9 place-items-center" onClick={() => setEdit(c)}><Pencil size={16} /></button>
            {confirmDelete === c.id
              ? <button className="btn btn-ink btn-sm" onClick={async () => { const r = await deleteCategory(c.id!); setConfirmDelete(null); if (r.error) setError(r.error); else router.refresh(); }}>Delete?</button>
              : <button aria-label={`Delete ${c.name}`} className="grid size-9 place-items-center hover:text-clay" onClick={() => setConfirmDelete(c.id!)}><Trash2 size={16} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}
