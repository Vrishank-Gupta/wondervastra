"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Boxes, Tags, ExternalLink, FolderTree, History, LayoutDashboard, LogOut, Menu, MessageSquareHeart, Package, Percent, Settings, ShoppingCart, Users, X } from "lucide-react";
import { adminLogout } from "@/app/admin/actions";
import { Logo } from "../brand-logo";

const LINKS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, badge: "orders" },
  { href: "/admin/products", label: "Listings", icon: Package },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/brands", label: "Brands", icon: Tags },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes, badge: "stock" },
  { href: "/admin/discounts", label: "Discounts & sales", icon: Percent },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/reviews", label: "Reviews & feedback", icon: MessageSquareHeart, badge: "reviews" },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, badge: "notifs" },
  { href: "/admin/audit", label: "Audit log", icon: History },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];
type Badges = Record<string, number>;

function Links({ badges, pathname }: { badges: Badges; pathname: string }) {
  return (
    <nav className="flex flex-col gap-0.5 p-2" aria-label="Admin">
      {LINKS.map((l) => {
        const on = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
        const n = l.badge ? badges[l.badge] : 0;
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className={`flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-semibold ${on ? "bg-sand text-ink" : "text-white/80 hover:bg-white/10"}`}>
            <l.icon size={17} aria-hidden /> <span className="flex-1">{l.label}</span>
            {n > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-madder px-1.5 text-[11px] font-medium text-white">{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminNav({ name, badges }: { name: string; badges: Badges }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const foot = (
    <div className="mt-auto space-y-1 border-t border-white/15 p-3 text-sm">
      <p className="truncate px-1 text-white/60">{name}</p>
      <a href="/" target="_blank" className="flex items-center gap-2 rounded-sm px-1 py-1 text-white/85 hover:underline"><ExternalLink size={15} aria-hidden /> View store</a>
      <form action={adminLogout}><button className="flex items-center gap-2 rounded-sm px-1 py-1 text-white/85 hover:underline"><LogOut size={15} aria-hidden /> Log out</button></form>
    </div>
  );
  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col overflow-y-auto bg-wine lg:flex no-print">
        <Link href="/admin" aria-label="WonderVastra admin" className="px-5 py-4"><Logo onDark size="sm" /></Link>
        <Links badges={badges} pathname={pathname} />
        {foot}
      </aside>
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-wine px-3 py-2 lg:hidden no-print">
        <button aria-label="Open menu" className="grid size-10 place-items-center text-white" onClick={() => setOpen(true)}><Menu /></button>
        <Logo onDark size="sm" />
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col overflow-y-auto bg-wine">
            <div className="flex items-center justify-between px-4 py-3">
              <Logo onDark size="sm" />
              <button aria-label="Close menu" className="grid size-10 place-items-center text-white" onClick={() => setOpen(false)}><X /></button>
            </div>
            <Links badges={badges} pathname={pathname} />
            {foot}
          </aside>
        </div>
      )}
    </>
  );
}
