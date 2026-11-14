import type { Metadata } from "next";
import Link from "next/link";
import { BrandTile } from "@/components/store/brand-tile";
import { getActiveBrands } from "@/lib/catalog";

export const metadata: Metadata = { title: "Shop by brand", description: "Thermals from the brands you already trust, 100% original at the lowest prices." };

export default async function Brands() {
  const brands = await getActiveBrands();
  const house = brands.filter((b) => b.isHouse);
  const partners = brands.filter((b) => !b.isHouse);
  return (
    <>
      <div className="bg-sand-soft">
        <div className="container-x py-7 sm:py-10">
          <nav aria-label="Breadcrumb" className="mb-2 text-xs font-semibold tracking-[0.06em] text-ink-soft uppercase"><Link href="/" className="hover:underline">Home</Link> / Brands</nav>
          <h1 className="text-5xl sm:text-7xl">Shop by brand</h1>
          <p className="mt-2 text-ink-soft">100% original stock at the lowest prices, from {partners.length} {partners.length === 1 ? "brand" : "brands"} you know{house.length > 0 && ", plus our own label"}.</p>
        </div>
      </div>
      <div className="container-x py-8">
        {house.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-3xl">Our label</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{house.map((b) => <BrandTile key={b.id} brand={b} />)}</div>
          </section>
        )}
        <section>
          {house.length > 0 && <h2 className="mb-4 text-3xl">All brands</h2>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{partners.map((b) => <BrandTile key={b.id} brand={b} />)}</div>
        </section>
      </div>
    </>
  );
}
