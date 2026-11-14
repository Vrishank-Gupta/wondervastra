import Image from "next/image";
import Link from "next/link";

type Brand = { name: string; slug: string; logo: string | null; tagline?: string | null; isHouse?: boolean; productCount?: number };

/** A brand's uploaded logo, or a clean typeset wordmark until one is added. */
export function BrandMark({ brand, className = "" }: { brand: Brand; className?: string }) {
  if (brand.logo) return <span className={`relative block ${className}`}><Image src={brand.logo} alt={brand.name} fill sizes="200px" className="object-contain" /></span>;
  return <span className={`font-display grid place-items-center text-center leading-[0.95] uppercase ${className}`}>{brand.name}</span>;
}

export function BrandTile({ brand }: { brand: Brand }) {
  return (
    <Link href={`/brands/${brand.slug}`} className="group flex flex-col">
      <span className={`relative grid aspect-[3/2] place-items-center border p-4 transition-colors ${brand.isHouse ? "border-ink bg-ink text-white group-hover:bg-madder group-hover:border-madder" : "border-line bg-white group-hover:border-ink"}`}>
        <BrandMark brand={brand} className="h-full w-full text-[clamp(1.1rem,3.6vw,1.7rem)]" />
        {brand.isHouse && <span className="absolute top-1.5 left-1.5 bg-madder px-1.5 py-0.5 text-[9px] font-bold tracking-[0.1em] text-white uppercase group-hover:bg-white group-hover:text-madder">Our label</span>}
      </span>
      {brand.productCount != null && <span className="mt-1.5 text-center text-[11px] font-semibold text-ink-soft">{brand.productCount} {brand.productCount === 1 ? "style" : "styles"}</span>}
    </Link>
  );
}
