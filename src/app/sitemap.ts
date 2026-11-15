import type { MetadataRoute } from "next";
import { getActiveBrands, getActiveCategories, getAllCards } from "@/lib/catalog";
import { abs } from "@/lib/seo";
import { siteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Every public page, with product photos and last-changed dates so search engines recrawl what changed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [cats, brands, cards] = await Promise.all([getActiveCategories(), getActiveBrands(), getAllCards()]);
  const newest = cards.reduce((a, c) => Math.max(a, c.updatedAt), 0) || Date.now();
  const kidsTags = ["boys", "girls"];
  return [
    { url: base, priority: 1, changeFrequency: "daily", lastModified: new Date(newest) },
    { url: `${base}/shop`, priority: 0.9, changeFrequency: "daily", lastModified: new Date(newest) },
    { url: `${base}/sale`, priority: 0.8, changeFrequency: "daily" },
    { url: `${base}/family-pack`, priority: 0.7, changeFrequency: "weekly" },
    { url: `${base}/brands`, priority: 0.7, changeFrequency: "weekly" },
    ...cats.filter((c) => !c.comingSoon).flatMap((c) => {
      const inCat = cards.filter((p) => p.categoryId === c.id);
      const tags = kidsTags.filter((t) => inCat.some((p) => p.tags.includes(t)));
      return [
        { url: `${base}/c/${c.slug}`, priority: 0.9, changeFrequency: "daily" as const, lastModified: new Date(inCat.reduce((a, p) => Math.max(a, p.updatedAt), 0) || newest) },
        ...tags.map((t) => ({ url: `${base}/c/${c.slug}?collection=${t}`, priority: 0.8, changeFrequency: "daily" as const })),
      ];
    }),
    ...brands.map((b) => ({ url: `${base}/brands/${b.slug}`, priority: 0.7, changeFrequency: "weekly" as const })),
    ...cards.map((p) => ({ url: `${base}/p/${p.slug}`, priority: 0.8, changeFrequency: "weekly" as const, lastModified: new Date(p.updatedAt), images: p.images.slice(0, 5).map((i) => abs(i.url)) })),
    ...["about", "contact", "faq", "shipping-policy", "returns-policy", "privacy-policy", "terms"].map((s) => ({ url: `${base}/info/${s}`, priority: 0.3, changeFrequency: "monthly" as const })),
  ];
}
