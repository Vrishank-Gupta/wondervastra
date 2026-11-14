"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteAddressAction, saveAddressAction } from "../../order-actions";

type Addr = { id?: string; name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string; isDefault: boolean };
const EMPTY: Addr = { name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false };

export function AddressManager({ addresses }: { addresses: Addr[] }) {
  const [edit, setEdit] = useState<Addr | null>(null);
  const [error, setError] = useState("");
  const f = (k: keyof Addr, label: string, opts: { required?: boolean; full?: boolean } = { required: true }) => (
    <div className={opts.full ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={k}>{label}</label>
      <input id={k} className="input" required={opts.required} value={String(edit?.[k] ?? "")} onChange={(e) => setEdit((a) => ({ ...a!, [k]: e.target.value }))} />
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {addresses.map((a) => (
          <div key={a.id} className="card flex justify-between gap-3 p-4">
            <p className="text-sm"><b>{a.name}</b>{a.isDefault && <span className="sticker ml-2 bg-sand-soft">Default</span>}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</p>
            <div className="flex shrink-0 gap-1">
              <button aria-label={`Edit address for ${a.name}`} className="grid size-9 place-items-center" onClick={() => setEdit(a)}><Pencil size={16} /></button>
              <button aria-label={`Delete address for ${a.name}`} className="grid size-9 place-items-center hover:text-clay" onClick={() => deleteAddressAction(a.id!)}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
      {!edit && <button className="btn btn-white" onClick={() => setEdit(EMPTY)}><Plus size={16} aria-hidden /> Add address</button>}
      {edit && (
        <form className="card grid gap-3 p-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const r = await saveAddressAction(edit);
          if (r.error) setError(r.error); else { setEdit(null); setError(""); }
        }}>
          {f("name", "Full name")}{f("phone", "Mobile")}{f("line1", "House no, building, street", { required: true, full: true })}{f("line2", "Area, landmark", { required: false, full: true })}{f("pincode", "Pincode")}{f("city", "City")}{f("state", "State", { required: true, full: true })}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-4 accent-ink" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} /> Make this my default</label>
          {error && <p className="text-sm font-medium text-clay sm:col-span-2" role="alert">{error}</p>}
          <div className="flex gap-2 sm:col-span-2"><button className="btn btn-primary">Save</button><button type="button" className="btn btn-white" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}
