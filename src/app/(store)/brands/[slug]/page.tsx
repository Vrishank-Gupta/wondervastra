import { breadcrumbs, itemList, JsonLd } from "@/lib/seo";
import { areaLabel } from "@/lib/delivery-area";
import { getSettings } from "@/lib/settings";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/store/brand-tile";
import { filtersFromParams, Listing } from "@/components/store/listing";
import { getActiveBrands, getAllCards } from "@/lib/catalog";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [b, sp, s] = await Promise.all([getActiveBrands().then((all) => all.find((x) => x.slug === slug)), searchParams, getSettings()]);
  if (!b) return {};
  return {
    title: `${b.name} thermals online`,
    description: `Buy 100% original ${b.name} thermals online at the lowest prices${b.tagline ? `: ${b.tagline.toLowerCase()}` : ""}. Delivered across ${areaLabel(s)} by WonderVastra.`,
    alternates: { canonical: `/brands/${b.slug}` },
    ...(Object.keys(sp).length ? { robots: { index: false, follow: true } } : {}),
    openGraph: { images: b.image ? [b.image] : undefined },
  };
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [brands, cards] = await Promise.all([getActiveBrands(), getAllCards()]);
  const brand = brands.find((b) => b.slug === slug);
  if (!brand) notFound();
  const mine = cards.filter((c) => c.brandId === brand.id);
  const cats = [...new Map(mine.map((c) => [c.categorySlug, c.categoryName])).entries()];
  const sp = await searchParams;
  const filters = { ...filtersFromParams(sp), brand: undefined, category: typeof sp.category === "string" ? sp.category : undefined };
  const dark = brand.isHouse;
  return (
    <>
      <JsonLd data={[breadcrumbs([{ name: "Home", path: "/" }, { name: "Brands", path: "/brands" }, { name: brand.name, path: `/brands/${brand.slug}` }]), itemList(`${brand.name} thermals`, cards.filter((c) => c.brandId === brand.id && c.inStock))]} />
      <div className={`relative overflow-hidden ${dark ? "bg-ink text-white" : "bg-sand-soft"}`}>
        {brand.image && <Image src={brand.image} alt="" fill priority sizes="100vw" className="object-cover opacity-35" />}
        <div className="container-x relative flex flex-wrap items-center gap-x-8 gap-y-4 py-7 sm:py-10">
          <span className={`grid h-24 w-36 shrink-0 place-items-center border p-3 sm:h-28 sm:w-44 ${dark ? "border-white/30 bg-white/5" : "border-line bg-white"}`}>
            <BrandMark brand={brand} className="h-full w-full text-2xl sm:text-3xl" />
          </span>
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className={`mb-2 text-xs font-semibold tracking-[0.06em] uppercase ${dark ? "text-white/70" : "text-ink-soft"}`}>
              <Link href="/" className="hover:underline">Home</Link> / <Link href="/brands" className="hover:underline">Brands</Link> / {brand.name}
            </nav>
            <h1 className="text-5xl sm:text-7xl">{brand.name}</h1>
            <p className={`mt-2 ${dark ? "text-white/80" : "text-ink-soft"}`}>
              {brand.tagline ? `${brand.tagline} · ` : ""}{mine.length} {mine.length === 1 ? "style" : "styles"}{dark ? "" : " · 100% original, lowest prices"}
            </p>
          </div>
        </div>
      </div>
      <div className="container-x py-6">
        {cats.length > 1 && (
          <nav aria-label={`${brand.name} categories`} className="scrollbar-none -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <Link href={`/brands/${brand.slug}`} className={`shrink-0 border px-4 py-2 text-xs font-bold tracking-[0.06em] uppercase transition-colors ${!filters.category ? "border-ink bg-ink text-white" : "border-[#cfcfcf] hover:border-ink"}`}>All</Link>
            {cats.map(([s, name]) => (
              <Link key={s} href={`/brands/${brand.slug}?category=${s}`} className={`shrink-0 border px-4 py-2 text-xs font-bold tracking-[0.06em] uppercase transition-colors ${filters.category === s ? "border-ink bg-ink text-white" : "border-[#cfcfcf] hover:border-ink"}`}>{name}</Link>
            ))}
          </nav>
        )}
        <Listing cards={mine} filters={filters} />
      </div>
    </>
  );
}
