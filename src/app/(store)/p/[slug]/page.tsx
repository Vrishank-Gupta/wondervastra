import { abs, breadcrumbs, JsonLd, returnPolicy, shippingDetails } from "@/lib/seo";
import { capabilities } from "@/lib/capabilities";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Star } from "lucide-react";
import { ProductDetail } from "@/components/store/product-detail";
import { ProductGrid } from "@/components/store/product-grid";
import { RecentlyViewed } from "@/components/store/recently-viewed";
import { wishedIds } from "@/components/store/listing";
import { getAllCards, getLiveOffers, getProductBySlug } from "@/lib/catalog";
import { areaLabel } from "@/lib/delivery-area";
import { offerTiers } from "@/lib/pricing";
import { formatDate, money } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { siteUrl, withBrand } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

/** Rich previews are what make shared links convert on WhatsApp and Instagram. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = await getProductBySlug(slug);
  if (!d) return { title: "Not found" };
  const { product: p, images, variants, brand } = d;
  const price = variants.length ? Math.min(...variants.map((v) => v.price)) : p.price;
  const fullName = withBrand(p.name, brand?.name);
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
  const [settings, cards, wished, offers] = await Promise.all([getSettings(), getAllCards(), wishedIds(), getLiveOffers()]);
  const related = cards.filter((c) => c.categoryId === p.categoryId && c.id !== p.id && c.inStock).slice(0, 4);
  const sameBrand = brand ? cards.filter((c) => c.brandId === brand.id && c.id !== p.id && c.categoryId !== p.categoryId && c.inStock).slice(0, 4) : [];
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const minPrice = variants.length ? Math.min(...variants.map((v) => v.price)) : p.price;

  const maxPrice = variants.length ? Math.max(...variants.map((v) => v.price)) : p.price;
  const fullName = withBrand(p.name, brand?.name);
  const url = `${siteUrl()}/p/${p.slug}`;
  const inStock = !p.comingSoon && !p.forceOutOfStock && variants.some((v) => v.stock > 0);
  const saleEnds = variants.find((v) => v.saleEndsAt)?.saleEndsAt;
  const colours = [...new Set(variants.map((v) => v.option2).filter((c) => c !== "Default"))];
  const sizes = [...new Set(variants.map((v) => v.option1).filter((x) => x !== "Free size"))];
  const offer = {
    priceCurrency: "INR", url, itemCondition: "https://schema.org/NewCondition",
    availability: p.comingSoon ? "https://schema.org/PreOrder" : inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    ...(saleEnds ? { priceValidUntil: new Date(saleEnds).toISOString().slice(0, 10) } : {}),
    seller: { "@id": `${siteUrl()}/#store` },
    shippingDetails: shippingDetails(settings, p.deliveryMode === "free" ? 0 : p.deliveryCharge),
    ...(p.returnable ? { hasMerchantReturnPolicy: returnPolicy(settings) } : {}),
  };
  const jsonLd = [{
    "@context": "https://schema.org", "@type": "Product", "@id": `${url}#product`, name: fullName, url,
    description: p.shortDescription ?? p.description ?? undefined,
    image: images.map((i) => abs(i.url)),
    sku: variants[0]?.sku ?? p.id, mpn: p.id,
    brand: { "@type": "Brand", name: brand?.name ?? "WonderVastra" },
    category: category?.name, material: p.material ?? undefined,
    ...(colours.length ? { color: colours.join(", ") } : {}), ...(sizes.length ? { size: sizes.join(", ") } : {}),
    audience: p.tags.includes("baby") || p.tags.includes("boys") || p.tags.includes("girls") || p.tags.includes("kids")
      ? { "@type": "PeopleAudience", suggestedMinAge: p.tags.includes("baby") ? 0 : 2, suggestedMaxAge: p.tags.includes("baby") ? 2 : 14, ...(p.tags.includes("boys") && !p.tags.includes("girls") ? { suggestedGender: "male" } : p.tags.includes("girls") && !p.tags.includes("boys") ? { suggestedGender: "female" } : {}) }
      : undefined,
    offers: minPrice === maxPrice
      ? { "@type": "Offer", price: (minPrice / 100).toFixed(2), ...offer }
      : { "@type": "AggregateOffer", lowPrice: (minPrice / 100).toFixed(2), highPrice: (maxPrice / 100).toFixed(2), offerCount: variants.length, ...offer },
    ...(reviews.length ? {
      aggregateRating: { "@type": "AggregateRating", ratingValue: avg.toFixed(1), reviewCount: reviews.length },
      review: reviews.slice(0, 5).map((r) => ({ "@type": "Review", author: { "@type": "Person", name: r.name }, reviewRating: { "@type": "Rating", ratingValue: r.rating }, reviewBody: r.body ?? undefined })),
    } : {}),
  }, breadcrumbs([{ name: "Home", path: "/" }, ...(category ? [{ name: category.name, path: `/c/${category.slug}` }] : [{ name: "Shop", path: "/shop" }]), { name: fullName, path: `/p/${p.slug}` }])];

  return (
    <div className="container-x py-4 sm:py-6">
      <JsonLd data={jsonLd} />
      <nav aria-label="Breadcrumb" className="mb-3 truncate text-xs font-medium text-ink-soft">
        <Link href="/shop" className="-my-2 inline-block py-2 hover:underline">Shop</Link>{brand && <> / <Link href={`/brands/${brand.slug}`} className="hover:underline">{brand.name}</Link></>}{category && <> / <Link href={`/c/${category.slug}`} className="hover:underline">{category.name}</Link></>} / <span>{p.name}</span>
      </nav>
      <ProductDetail
        brand={brand ? { name: brand.name, slug: brand.slug, isHouse: brand.isHouse, logo: brand.logo } : null}
        product={{
          id: p.id, name: p.name, slug: p.slug, shortDescription: p.shortDescription, description: p.description, material: p.material, care: p.care, sizeGuide: p.sizeGuide, sizeChart: p.sizeChart, sizeHeights: p.sizeHeights ?? {},
          option1Label: p.option1Label, option2Label: p.option2Label, deliveryMode: p.deliveryMode, deliveryCharge: p.deliveryCharge, codAllowed: p.codAllowed, returnable: p.returnable,
          showStockCount: p.showStockCount, lowStockThreshold: p.lowStockThreshold, maxPerOrder: p.maxPerOrder, maxPerCustomer: p.maxPerCustomer, forceOutOfStock: p.forceOutOfStock, comingSoon: p.comingSoon, launchNote: p.launchNote,
          minPieces: p.minPieces, comboAbove: p.comboAbove,
        }}
        images={images.map((i) => ({ url: i.url, alt: i.alt }))}
        variants={variants}
        rating={{ avg, count: reviews.length }}
        wished={wished.includes(p.id)}
        settings={{ codEnabled: settings.codEnabled, onlinePayments: capabilities().onlinePayments, dispatchDays: settings.dispatchDays, deliveryDaysMin: settings.deliveryDaysMin, deliveryDaysMax: settings.deliveryDaysMax, returnWindowDays: settings.returnWindowDays, deliveryArea: areaLabel(settings), areaRestricted: Boolean(settings.deliveryPincodes.trim()) }}
        tiers={offerTiers(offers)}
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
