import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GUIDES } from "@/lib/guides";
import { breadcrumbs, JsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Thermal wear buying guides",
  description: "Size charts by age, men's sizes, Amul vs Dollar vs Lux compared, and how to choose thermals for Delhi winters.",
  alternates: { canonical: "/guides", types: { "text/markdown": "/guides.md" } },
};

export default function GuidesPage() {
  return (
    <div className="container-x py-8">
      <JsonLd data={breadcrumbs([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }])} />
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow text-madder">Buying guides</p>
        <h1 className="text-4xl sm:text-5xl">Thermal wear, made simple</h1>
        <p className="mt-3 text-ink-soft">Straight answers to what parents and buyers ask us most: which size, which brand, and how to wear and wash thermals.</p>
        <ul className="mt-8 grid gap-3">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`} className="group flex items-center justify-between gap-4 border border-line bg-white p-4 hover:border-ink sm:p-5">
                <span><span className="font-display block text-2xl leading-tight">{g.title}</span><span className="mt-1 block text-sm text-ink-soft">{g.short}</span></span>
                <ArrowRight className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
