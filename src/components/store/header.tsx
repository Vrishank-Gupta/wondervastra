"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronRight, Heart, Home, LayoutGrid, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { money } from "@/lib/format";
import { useCart } from "./cart-context";
import { Logo } from "../brand-logo";

export { Logo };

type Suggestion = { name: string; slug: string; image: string | null; price: number; category: string };

function SearchBox({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`);
      if (res.ok) { setResults(await res.json()); setOpen(true); }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <form ref={box} role="search" className="relative w-full" onSubmit={(e) => {
      e.preventDefault();
      if (!q.trim()) return;
      setOpen(false); onDone?.();
      router.push(`/shop?q=${encodeURIComponent(q.trim())}`);
    }}>
      <Search size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-soft" />
      <input
        type="search" enterKeyHint="search" autoComplete="off" aria-label="Search products" autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)}
        placeholder="Search thermals, brands…" className="w-full border border-transparent bg-sand py-2.5 pr-3 pl-10 text-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink focus:bg-white md:text-sm"
      />
      {open && q.trim().length >= 2 && (
        <div className="pop-in absolute top-full left-0 z-40 mt-1 w-full overflow-hidden border border-line bg-white shadow-xl shadow-black/10">
          {results.length === 0 && <p className="p-4 text-sm text-ink-soft">No matches for “{q}”. Try “thermal” or a brand name.</p>}
          {results.map((r) => (
            <Link key={r.slug} href={`/p/${r.slug}`} onClick={() => { setOpen(false); onDone?.(); }} className="flex items-center gap-3 border-b border-line p-2.5 last:border-0 hover:bg-sand-soft">
              <span className="relative h-14 w-11 shrink-0 overflow-hidden bg-sand-soft">{r.image && <Image src={r.image} alt="" fill sizes="44px" className="object-cover" />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.name}</span><span className="block text-xs text-ink-soft">{r.category}</span></span>
              <span className="text-sm font-bold">{money(r.price)}</span>
            </Link>
          ))}
        </div>
      )}
    </form>
  );
}

type NavCat = { name: string; slug: string; comingSoon?: boolean };

function AnnouncementBar({ items }: { items: string[] }) {
  if (!items.length) return null;
  const run = [...items, ...items, ...items];
  return (
    <div className="overflow-hidden bg-ink py-2 text-white no-print" role="region" aria-label="Offers">
      <ul className="sr-only">{items.map((t) => <li key={t}>{t}</li>)}</ul>
      <div className="marquee flex w-max" aria-hidden>
        {[0, 1].map((half) => (
          <div key={half} className="flex shrink-0">
            {run.map((t, i) => <span key={i} className="flex items-center gap-6 pr-6 text-[11px] font-bold tracking-[0.12em] whitespace-nowrap uppercase">{t}<span className="size-1 rounded-full bg-madder" /></span>)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Header({ categories, announcements, loggedIn }: { categories: NavCat[]; announcements: string[]; loggedIn: boolean }) {
  const { count, ready, setDrawerOpen } = useCart();
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setMenu(false); setSearchOpen(false); }, [pathname]);
  const navLink = (active: boolean) => `whitespace-nowrap border-b-2 py-3 text-[12px] font-bold tracking-[0.08em] uppercase transition-colors hover:border-ink ${active ? "border-ink" : "border-transparent"}`;
  const badge = ready && count > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full bg-madder px-1 text-[10px] leading-[18px] font-bold text-white">{count}</span>;

  return (
    <>
      <AnnouncementBar items={announcements} />
      <header className="sticky top-0 z-30 border-b border-line bg-white no-print">
        <div className="container-x flex items-center gap-3 py-3 lg:gap-8">
          <button aria-label="Open menu" className="-ml-2 grid size-10 place-items-center lg:hidden" onClick={() => setMenu(true)}><Menu size={24} /></button>
          <Link href="/" aria-label="WonderVastra home" className="shrink-0"><Logo className="max-[380px]:[&_svg]:h-7 max-[380px]:[&>span:last-child]:text-[1.05rem]" /></Link>
          <nav aria-label="Categories" className="hidden min-w-0 flex-1 items-center gap-5 overflow-x-auto lg:flex scrollbar-none">
            <Link href="/shop" className={navLink(pathname === "/shop")}>Shop all</Link>
            <Link href="/brands" className={navLink(pathname.startsWith("/brands"))}>Brands</Link>
            {categories.filter((c) => !c.comingSoon).slice(0, 2).map((c) => <Link key={c.slug} href={`/c/${c.slug}`} className={navLink(pathname === `/c/${c.slug}`)}>{c.name}</Link>)}
            <Link href="/sale" className={`${navLink(pathname === "/sale")} text-madder`}>Sale</Link>
          </nav>
          <div className="ml-auto hidden w-full max-w-xs md:block lg:hidden xl:block xl:max-w-[16rem] 2xl:max-w-sm"><SearchBox /></div>
          <div className="ml-auto flex items-center md:ml-0 lg:ml-auto xl:ml-0">
            <button aria-label="Search" className="grid size-10 place-items-center md:hidden lg:grid xl:hidden" onClick={() => setSearchOpen((v) => !v)}><Search size={22} /></button>
            <Link href={loggedIn ? "/account" : "/login"} aria-label={loggedIn ? "My account" : "Log in"} className="hidden size-10 place-items-center md:grid"><User size={22} /></Link>
            <Link href={loggedIn ? "/account/wishlist" : "/login?next=/account/wishlist"} aria-label="Wishlist" className="hidden size-10 place-items-center md:grid"><Heart size={22} /></Link>
            <button aria-label={`Cart, ${count} items`} className="relative -mr-2 grid size-10 place-items-center" onClick={() => setDrawerOpen(true)}>
              <ShoppingBag size={22} />{badge}
            </button>
          </div>
        </div>
        {searchOpen && <div className="container-x pb-3 md:hidden lg:block xl:hidden"><SearchBox autoFocus onDone={() => setSearchOpen(false)} /></div>}
      </header>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenu(false)} />
          <div className="slide-in absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-white [animation-direction:normal]">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Logo />
              <button aria-label="Close menu" className="-mr-2 grid size-10 place-items-center" onClick={() => setMenu(false)}><X size={22} /></button>
            </div>
            <nav className="flex flex-col">
              <Link className="flex items-center justify-between border-b border-line px-4 py-4 text-sm font-bold tracking-[0.06em] uppercase" href="/shop">Shop all<ChevronRight size={18} aria-hidden /></Link>
              <Link className="flex items-center justify-between border-b border-line px-4 py-4 text-sm font-bold tracking-[0.06em] uppercase" href="/brands">Shop by brand<ChevronRight size={18} aria-hidden /></Link>
              {categories.map((c) => <Link key={c.slug} className="flex items-center justify-between border-b border-line px-4 py-4 text-sm font-bold tracking-[0.06em] uppercase" href={`/c/${c.slug}`}><span>{c.name}{c.comingSoon && <span className="ml-2 bg-slate px-1.5 py-0.5 align-middle text-[9px] text-white">Soon</span>}</span><ChevronRight size={18} aria-hidden /></Link>)}
              <Link className="flex items-center justify-between border-b border-line px-4 py-4 text-sm font-bold tracking-[0.06em] text-madder uppercase" href="/sale">Sale & offers<ChevronRight size={18} aria-hidden /></Link>
              <div className="flex flex-col gap-1 bg-sand-soft px-4 py-4 text-sm">
                <Link className="py-1.5" href="/track">Track order</Link>
                <Link className="py-1.5" href={loggedIn ? "/account" : "/login"}>{loggedIn ? "My account" : "Log in"}</Link>
                <Link className="py-1.5" href="/info/contact">Help & contact</Link>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

/** Thumb-friendly navigation for shoppers arriving from Instagram and WhatsApp on phones. */
export function MobileTabBar({ loggedIn }: { loggedIn: boolean }) {
  const { count, ready, setDrawerOpen } = useCart();
  const pathname = usePathname();
  // Product and checkout pages have their own sticky action bar.
  if (pathname.startsWith("/p/") || pathname.startsWith("/checkout")) return null;
  const item = "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-bold tracking-[0.06em] uppercase text-ink-soft";
  const on = (p: string) => (pathname === p ? "text-ink" : "");
  return (
    <>
      <div className="h-16 md:hidden" aria-hidden />
      <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden no-print">
        <Link className={`${item} ${on("/")}`} href="/"><Home size={21} aria-hidden />Home</Link>
        <Link className={`${item} ${on("/shop")}`} href="/shop"><LayoutGrid size={21} aria-hidden />Shop</Link>
        <button className={`${item} relative`} onClick={() => setDrawerOpen(true)}>
          <span className="relative"><ShoppingBag size={21} aria-hidden />
            {ready && count > 0 && <span className="absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full bg-madder px-1 text-[10px] leading-4 text-white">{count}</span>}
          </span>Cart
        </button>
        <Link className={`${item} ${on("/account")}`} href={loggedIn ? "/account" : "/login"}><User size={21} aria-hidden />{loggedIn ? "Account" : "Log in"}</Link>
      </nav>
    </>
  );
}
