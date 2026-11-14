import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/cinzel/600.css";
import "./globals.css";
import { previewMode } from "@/lib/preview";
import { siteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "WonderVastra | 100% original brands, lowest prices", template: "%s | WonderVastra" },
  description: "100% original branded thermals for men, kids and babies (0+) at the lowest prices, with more innerwear and our own hoodies coming soon. Secure payment, order tracking on WhatsApp and delivery across India.",
  openGraph: { siteName: "WonderVastra", type: "website", locale: "en_IN", images: ["/seed/px-15072827-wide.jpg"] },
  ...(previewMode() ? { robots: { index: false, follow: false } } : {}),
};
export const viewport: Viewport = { themeColor: "#111111", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" data-scroll-behavior="smooth">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
