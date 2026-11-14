import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Star } from "lucide-react";
import { ProductDetail } from "@/components/store/product-detail";
import { ProductGrid } from "@/components/store/product-grid";
import { RecentlyViewed } from "@/components/store/recently-viewed";
import { wishedIds } from "@/components/store/listing";
import { getAllCards, getProductBySlug } from "@/lib/catalog";
import { formatDate, money } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

/** Rich previews are what make shared links convert on WhatsApp and Instagram. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = await getProductBySlug(slug);
  if (!d) return { title: "Not found" };
  const { product: p, images, variants, brand } = d;
  const price = variants.length ? Math.min(...variants.map((v) => v.price)) : p.price;
  const fullName = brand ? `${brand.name} ${p.name}` : p.name;
  const title = p.seoTitle || `${fullName} · ${money(price)}`;
  const description = p.seoDescription || p.shortDescription || `Shop ${fullName} at WonderVastra.`;
  return {
    title, description, alternates: { canonical: `/p/${p.slug}` },
    openGraph: { title, description, type: "website", url: `/p/${p.slug}`, images: images[0] ? [{ url: `/api/og/${p.id}`, width: 1200, height: 630, alt: p.name }] : undefined },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const d = await getProductBySlug(slug);
  if (!d) notFound();
  const { product: p, images, variants, category, brand, reviews } = d;
  const [settings, cards, wished] = await Promise.all([getSettings(), getAllCards(), wishedIds()]);
  const related = cards.filter((c) => c.categoryId === p.categoryId && c.id !== p.id && c.inStock).slice(0, 4);
  const sameBrand = brand ? cards.filter((c) => c.brandId === brand.id && c.id !== p.id && c.categoryId !== p.categoryId && c.inStock).slice(0, 4) : [];
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const minPrice = variants.length ? Math.min(...variants.map((v) => v.price)) : p.price;

  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.shortDescription ?? undefined,
    image: images.map((i) => (i.url.startsWith("http") ? i.url : `${siteUrl()}${i.url}`)),
    sku: variants[0]?.sku ?? p.id, brand: { "@type": "Brand", name: brand?.name ?? "WonderVastra" },
    offers: { "@type": "Offer", priceCurrency: "INR", price: (minPrice / 100).toFixed(2), url: `${siteUrl()}/p/${p.slug}`, availability: variants.some((v) => v.stock > 0) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
    ...(reviews.length ? { aggregateRating: { "@type": "AggregateRating", ratingValue: avg.toFixed(1), reviewCount: reviews.length } } : {}),
  };

  return (
    <div className="container-x py-4 sm:py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="mb-3 truncate text-xs font-medium text-ink-soft">
        <Link href="/shop" className="hover:underline">Shop</Link>{brand && <> / <Link href={`/brands/${brand.slug}`} className="hover:underline">{brand.name}</Link></>}{category && <> / <Link href={`/c/${category.slug}`} className="hover:underline">{category.name}</Link></>} / <span>{p.name}</span>
      </nav>
      <ProductDetail
        brand={brand ? { name: brand.name, slug: brand.slug, isHouse: brand.isHouse } : null}
        product={{
          id: p.id, name: p.name, slug: p.slug, shortDescription: p.shortDescription, description: p.description, material: p.material, care: p.care, sizeGuide: p.sizeGuide,
          option1Label: p.option1Label, option2Label: p.option2Label, deliveryMode: p.deliveryMode, deliveryCharge: p.deliveryCharge, codAllowed: p.codAllowed, returnable: p.returnable,
          showStockCount: p.showStockCount, lowStockThreshold: p.lowStockThreshold, maxPerOrder: p.maxPerOrder, maxPerCustomer: p.maxPerCustomer, forceOutOfStock: p.forceOutOfStock, comingSoon: p.comingSoon, launchNote: p.launchNote,
        }}
        images={images.map((i) => ({ url: i.url, alt: i.alt }))}
        variants={variants}
        rating={{ avg, count: reviews.length }}
        wished={wished.includes(p.id)}
        settings={{ codEnabled: settings.codEnabled, dispatchDays: settings.dispatchDays, deliveryDaysMin: settings.deliveryDaysMin, deliveryDaysMax: settings.deliveryDaysMax, returnWindowDays: settings.returnWindowDays }}
      />

      {reviews.length > 0 && (
        <section id="reviews" className="mt-12 scroll-mt-24">
          <h2 className="text-3xl">Buyer reviews</h2>
          <p className="mt-1 flex items-center gap-1 font-medium"><Star size={18} className="fill-ink text-ink" aria-hidden />{avg.toFixed(1)} out of 5 · {reviews.length} verified {reviews.length === 1 ? "buyer" : "buyers"}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {reviews.map((r) => (
              <article key={r.id} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{r.name}</p>
                  <span className="flex" aria-label={`${r.rating} out of 5 stars`}>{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} className={i < r.rating ? "fill-ink text-ink" : "text-ink/25"} aria-hidden />)}</span>
                </div>
                {r.body && <p className="mt-1 text-sm text-ink-soft">{r.body}</p>}
                <p className="mt-2 text-xs text-ink-soft">Verified purchase · {formatDate(r.createdAt)}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-3xl">You might also like</h2>
          <ProductGrid products={related} wished={wished} />
        </section>
      )}
      {sameBrand.length > 0 && brand && (
        <section className="mt-12">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-3xl">More from {brand.name}</h2>
            <Link href={`/brands/${brand.slug}`} className="text-xs font-bold tracking-[0.1em] uppercase underline underline-offset-4">View all</Link>
          </div>
          <ProductGrid products={sameBrand} wished={wished} />
        </section>
      )}
      <RecentlyViewed currentId={p.id} />
    </div>
  );
}
