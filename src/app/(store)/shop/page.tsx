import type { Metadata } from "next";
import Link from "next/link";
import { filtersFromParams, Listing } from "@/components/store/listing";
import { getActiveCategories, getAllCards } from "@/lib/catalog";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const sp = await searchParams;
  const base: Metadata = { title: "Shop all thermals", description: "Shop 100% original kids' and men's thermals online in India from top brands at the lowest prices. Secure UPI and card payments.", alternates: { canonical: "/shop" } };
  // Search results and filter combinations aren't indexed: endless near-duplicates. Links on them still count.
  return Object.keys(sp).length ? { ...base, robots: { index: false, follow: true } } : base;
}
const TITLES: Record<string, string> = { kids: "Kids' thermals", baby: "Baby thermals (0–24 months)", boys: "Boys' thermals", girls: "Girls' thermals", winter: "Winter warmers", everyday: "Everyday essentials", new: "New in", value: "Value packs", sport: "Sport & active", bestseller: "Bestsellers" };

export default async function Shop({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = filtersFromParams(await searchParams);
  const [cards, cats] = await Promise.all([getAllCards(), getActiveCategories()]);
  const title = filters.q ? `Results for “${filters.q}”` : filters.collection ? (TITLES[filters.collection] ?? filters.collection) : "Shop all";
  return (
    <div className="container-x py-6">
      <h1 className="text-5xl sm:text-7xl">{title}</h1>
      <nav aria-label="Categories" className="scrollbar-none -mx-4 mt-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {cats.map((c) => <Link key={c.id} href={`/c/${c.slug}`} className="flex min-h-11 shrink-0 items-center border border-[#cfcfcf] px-4 py-2 text-xs font-bold tracking-[0.06em] uppercase transition-colors hover:border-ink hover:bg-ink hover:text-white">{c.name}{c.comingSoon && <span className="ml-1.5 text-ink-soft">· Soon</span>}</Link>)}
      </nav>
      <Listing cards={cards} filters={filters} />
    </div>
  );
}
