import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";
import { getActiveBrands, getActiveCategories, getAllCards } from "@/lib/catalog";
import { siteUrl } from "@/lib/utils";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [cats, brands, cards] = await Promise.all([getActiveCategories(), getActiveBrands(), getAllCards()]);
  return [
    { url: base, priority: 1 },
    { url: `${base}/shop`, priority: 0.9 },
    { url: `${base}/sale`, priority: 0.8 },
    { url: `${base}/brands`, priority: 0.8 },
    ...cats.map((c) => ({ url: `${base}/c/${c.slug}`, priority: 0.8 })),
    ...brands.map((b) => ({ url: `${base}/brands/${b.slug}`, priority: 0.8 })),
    ...cards.map((p) => ({ url: `${base}/p/${p.slug}`, priority: 0.7 })),
    ...["about", "contact", "faq", "shipping-policy", "returns-policy", "privacy-policy", "terms"].map((s) => ({ url: `${base}/info/${s}`, priority: 0.3 })),
  ];
}
