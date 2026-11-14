import Link from "next/link";
import { Heart, KeyRound, LogOut, MapPin, Package } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const c = await requireCustomer();
  const link = "flex shrink-0 items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-medium hover:bg-sand";
  return (
    <div className="container-x py-6">
      <h1 className="text-4xl">{c.name ? `Hello, ${c.name.split(" ")[0]}` : "Your account"}</h1>
      <p className="text-sm text-ink-soft">{c.email ?? c.phone}</p>
      <nav aria-label="Account" className="scrollbar-none -mx-4 my-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Link className={link} href="/account"><Package size={15} aria-hidden /> Orders</Link>
        <Link className={link} href="/account/wishlist"><Heart size={15} aria-hidden /> Wishlist</Link>
        <Link className={link} href="/account/addresses"><MapPin size={15} aria-hidden /> Addresses</Link>
        <Link className={link} href="/account/security"><KeyRound size={15} aria-hidden /> Login &amp; security</Link>
        <form action={logout}><button className={link}><LogOut size={15} aria-hidden /> Log out</button></form>
      </nav>
      {children}
    </div>
  );
}
