import { Users } from "lucide-react";

/** Invite to the store's WhatsApp group: new stock, restocks and deals first. */
export function WhatsAppGroupBand({ url, compact = false }: { url: string; compact?: boolean }) {
  if (!url) return null;
  if (compact) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mb-5 flex items-center gap-3 rounded-sm border border-line bg-white p-3 hover:border-ink">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-ink"><Users size={18} aria-hidden /></span>
        <span className="text-sm"><b className="block">Join our WhatsApp group</b>New stock, restocks and members-only deals, first.</span>
      </a>
    );
  }
  return (
    <section aria-label="WhatsApp group" className="container-x pt-12 sm:pt-16">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#E7F8EE] p-5 sm:p-7">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#25D366] text-ink"><Users size={22} aria-hidden /></span>
          <div><h2 className="text-2xl sm:text-3xl">Join the WonderVastra WhatsApp group</h2><p className="text-sm text-ink-soft">New stock, restocks and members-only deals, before anyone else.</p></div>
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-ink">Join on WhatsApp</a>
      </div>
    </section>
  );
}
