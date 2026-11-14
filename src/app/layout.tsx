import type { Metadata, Viewport } from "next";
import { getActiveBrands } from "@/lib/catalog";
import { areaPhrase, brandPhrase } from "@/lib/seo";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/cinzel/600.css";
import "./globals.css";
import { previewMode } from "@/lib/preview";
import { siteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const brands = previewMode() ? [] : await getActiveBrands().catch(() => []);
  const names = brands.filter((b) => !b.isHouse).map((b) => b.name);
  const s = previewMode() ? DEFAULT_SETTINGS : await getSettings().catch(() => DEFAULT_SETTINGS);
  const local = Boolean(s.deliveryPincodes.trim());
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: "WonderVastra | Original kids' & men's thermals online at the lowest prices", template: "%s | WonderVastra" },
    description: `Buy 100% original branded thermals online${local ? ` in ${s.deliveryAreaName}` : " in India"} at the lowest prices: kids' thermals for babies (0–24 months), boys and girls, and men's thermal wear from ${brandPhrase(names)}. Delivering across ${areaPhrase(s)}.`,
    applicationName: "WonderVastra",
    keywords: [...(local ? [`thermals online ${s.deliveryAreaName}`, `kids thermals ${s.deliveryAreaName}`] : []), ...(local && /delhi/i.test(s.deliveryAreaName) ? ["thermal wear Delhi", "thermals Gurgaon", "thermals Noida"] : []), "thermals online India", "kids thermal wear", "baby thermals", "boys thermal set", "girls thermal set", "men's thermal wear", "winter inner wear", "original branded thermals", ...names.map((n) => `${n} thermals`), "WonderVastra"],
    openGraph: { siteName: "WonderVastra", type: "website", locale: "en_IN", images: [{ url: "/brand/wondervastra-logo.png", width: 1600, height: 900, alt: "WonderVastra: crafted with trust" }] },
    twitter: { card: "summary_large_image", images: ["/brand/wondervastra-logo.png"] },
    // Codes from Google Search Console / Bing Webmaster Tools (set as Cloudflare variables) prove you own the site.
    verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined, other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined },
    formatDetection: { telephone: false },
    ...(previewMode() ? { robots: { index: false, follow: false } } : {}),
  };
}
export const viewport: Viewport = { themeColor: "#2A0E16", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" data-scroll-behavior="smooth">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
