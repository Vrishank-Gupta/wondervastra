"use client";
import Link from "next/link";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProductCard as Card } from "@/lib/catalog";
import { ProductCard } from "./product-card";

/** Section title plus a swipeable row of products (arrows on desktop). */
export function ProductRail({ title, href, cta = "View all", products, wished = [] }: { title: string; href?: string; cta?: string; products: Card[]; wished?: string[] }) {
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.85, behavior: "smooth" });
  if (!products.length) return null;
  return (
    <section className="container-x pt-12 sm:pt-16">
      <SectionTitle title={title} href={href} cta={cta}>
        <div className="hidden gap-1 lg:flex">
          <button type="button" aria-label={`Scroll ${title} left`} onClick={() => scroll(-1)} className="grid size-9 place-items-center border border-line hover:border-ink"><ChevronLeft size={18} /></button>
          <button type="button" aria-label={`Scroll ${title} right`} onClick={() => scroll(1)} className="grid size-9 place-items-center border border-line hover:border-ink"><ChevronRight size={18} /></button>
        </div>
      </SectionTitle>
      <div ref={row} className="rail">
        {products.map((p) => (
          <div key={p.id} className="w-[44%] shrink-0 sm:w-[30%] lg:w-[calc((100%-3*0.75rem)/4)] xl:w-[calc((100%-4*0.75rem)/5)]">
            <ProductCard p={p} wished={wished.includes(p.id)} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SectionTitle({ title, href, cta = "View all", children }: { title: string; href?: string; cta?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 className="text-[2rem] sm:text-5xl">{title}</h2>
      <div className="flex shrink-0 items-center gap-4 pb-1">
        {href && <Link href={href} className="link-quiet">{cta}</Link>}
        {children}
      </div>
    </div>
  );
}
