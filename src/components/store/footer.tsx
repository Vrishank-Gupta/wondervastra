import Link from "next/link";
import { BadgeCheck, CreditCard, MessageCircle, RotateCcw, Truck } from "lucide-react";
import type { StoreSettings } from "@/lib/settings";
import { Logo } from "../brand-logo";

export function WhatsAppFab({ number }: { number: string }) {
  if (!number) return null;
  return (
    <a
      href={`https://wa.me/${number.replace(/\D/g, "").replace(/^(?=[6-9]\d{9}$)/, "91")}?text=${encodeURIComponent("Hi WonderVastra, I have a question.")}`}
      target="_blank" rel="noreferrer" aria-label="Chat with us on WhatsApp"
      className="fixed right-4 bottom-20 z-20 grid size-12 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 md:bottom-6 no-print"
    >
      <MessageCircle size={22} aria-hidden />
    </a>
  );
}

export function TrustStrip({ settings }: { settings: StoreSettings }) {
  const items = [
    { icon: CreditCard, title: "Secure payment", text: settings.codEnabled ? "UPI, cards & cash on delivery" : "UPI, cards & netbanking" },
    { icon: Truck, title: `Ships in ${settings.dispatchDays} days`, text: `Delivered in ${settings.deliveryDaysMin}–${settings.deliveryDaysMax} days` },
    { icon: BadgeCheck, title: "100% original brands", text: "At the lowest prices" },
    { icon: RotateCcw, title: `${settings.returnWindowDays}-day returns`, text: "On eligible items" },
  ];
  return (
    <section aria-label="Why shop with us" className="bg-sand-soft">
      <div className="container-x grid grid-cols-2 gap-x-4 gap-y-6 py-7 lg:grid-cols-4">
        {items.map((i) => (
          <div key={i.title} className="flex items-center gap-3">
            <i.icon size={26} strokeWidth={1.75} aria-hidden className="shrink-0" />
            <div><p className="text-[13px] font-bold tracking-[0.04em] uppercase">{i.title}</p><p className="text-xs text-ink-soft">{i.text}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Footer({ categories, settings }: { categories: { name: string; slug: string; comingSoon?: boolean }[]; settings: StoreSettings }) {
  const h = "mb-4 text-xs font-bold tracking-[0.14em] text-white uppercase";
  const a = "text-white/70 transition-colors hover:text-white";
  return (
    <footer className="mt-14 bg-wine text-white no-print">
      <div className="container-x grid grid-cols-2 gap-x-6 gap-y-10 py-12 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <p aria-label="WonderVastra"><Logo onDark size="lg" /></p>
          <p className="mt-3 max-w-xs text-sm text-white/70">{settings.tagline}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {settings.instagramUrl && <a className="btn btn-sm border-white/40 text-white hover:bg-white hover:text-ink" href={settings.instagramUrl} target="_blank" rel="noreferrer">Instagram</a>}
            {settings.facebookUrl && <a className="btn btn-sm border-white/40 text-white hover:bg-white hover:text-ink" href={settings.facebookUrl} target="_blank" rel="noreferrer">Facebook</a>}
          </div>
        </div>
        <div>
          <h2 className={h} style={{ fontStretch: "100%" }}>Shop</h2>
          <ul className="space-y-2.5 text-sm">
            <li><Link className={a} href="/brands">All brands</Link></li>
            {categories.slice(0, 8).map((c) => <li key={c.slug}><Link className={a} href={`/c/${c.slug}`}>{c.name}</Link>{c.comingSoon && <span className="ml-1.5 text-[11px] text-white/45">· soon</span>}</li>)}
            <li><Link className={a} href="/sale">Sale & offers</Link></li>
          </ul>
        </div>
        <div>
          <h2 className={h} style={{ fontStretch: "100%" }}>Help</h2>
          <ul className="space-y-2.5 text-sm">
            <li><Link className={a} href="/track">Track your order</Link></li>
            <li><Link className={a} href="/info/faq">FAQs</Link></li>
            <li><Link className={a} href="/info/shipping-policy">Shipping</Link></li>
            <li><Link className={a} href="/info/returns-policy">Returns & refunds</Link></li>
            <li><Link className={a} href="/info/contact">Contact us</Link></li>
          </ul>
        </div>
        <div>
          <h2 className={h} style={{ fontStretch: "100%" }}>About</h2>
          <ul className="space-y-2.5 text-sm">
            <li><Link className={a} href="/info/about">Our story</Link></li>
            <li><Link className={a} href="/info/privacy-policy">Privacy policy</Link></li>
            <li><Link className={a} href="/info/terms">Terms of use</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <p className="container-x py-5 text-xs text-white/50">© {new Date().getFullYear()} {settings.legalName || settings.storeName}. Payments secured by Razorpay.</p>
      </div>
    </footer>
  );
}
