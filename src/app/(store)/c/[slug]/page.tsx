import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { filtersFromParams, Listing } from "@/components/store/listing";
import { Bell } from "lucide-react";
import { getActiveCategories, getAllCards } from "@/lib/catalog";
import { AUDIENCES } from "@/lib/home-banners";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = (await getActiveCategories()).find((c) => c.slug === slug);
  if (!cat) return {};
  return { title: cat.name, description: cat.tagline ?? undefined, openGraph: { images: cat.image ? [cat.image] : undefined } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [cats, cards] = await Promise.all([getActiveCategories(), getAllCards()]);
  const cat = cats.find((c) => c.slug === slug);
  if (!cat) notFound();
  const inCat = cards.filter((c) => c.categoryId === cat.id);
  const sp = await searchParams;
  const filters = filtersFromParams(sp);
  // "Baby / Boys / Girls" style shortcuts appear when listings in this category carry those tags.
  const audiences = AUDIENCES.filter((a) => inCat.some((c) => c.tags.includes(a.tag)));
  const chip = (on: boolean) => `shrink-0 border px-4 py-2 text-xs font-bold tracking-[0.06em] uppercase transition-colors ${on ? "border-ink bg-ink text-white" : "border-[#cfcfcf] hover:border-ink"}`;
  return (
    <>
      <div className="bg-sand-soft">
        <div className="container-x py-7 sm:py-10">
          <nav aria-label="Breadcrumb" className="mb-2 text-xs font-semibold tracking-[0.06em] text-ink-soft uppercase"><Link href="/" className="hover:underline">Home</Link> / <Link href="/shop" className="hover:underline">Shop</Link> / {cat.name}</nav>
          <h1 className="text-5xl sm:text-7xl">{cat.name}</h1>
          {cat.tagline && <p className="mt-2 text-ink-soft">{cat.tagline} · {inCat.length} {inCat.length === 1 ? "style" : "styles"}</p>}
        </div>
      </div>
      {cat.comingSoon && (
        <div className="bg-ink text-white">
          <p className="container-x flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
            <Bell size={16} aria-hidden className="text-madder" /><b className="tracking-[0.06em] uppercase">Coming soon</b>
            <span className="text-white/75">This range isn&apos;t on sale yet. Open any item and tap “Notify me” to hear the day it launches.</span>
            <Link href="/shop" className="ml-auto text-xs font-bold tracking-[0.08em] uppercase underline underline-offset-4">Shop what&apos;s live</Link>
          </p>
        </div>
      )}
      <div className="container-x py-6">
        {audiences.length > 1 && (
          <nav aria-label={`${cat.name} by age`} className="scrollbar-none -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <Link href={`/c/${cat.slug}`} className={chip(!filters.collection)}>All</Link>
            {audiences.map((a) => <Link key={a.tag} href={`/c/${cat.slug}?collection=${a.tag}`} className={chip(filters.collection === a.tag)}>{a.label} <span className="font-semibold opacity-70">· {a.sub}</span></Link>)}
          </nav>
        )}
        <Listing cards={inCat} filters={filters} />
      </div>
    </>
  );
}
