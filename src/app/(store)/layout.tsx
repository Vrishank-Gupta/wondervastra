import { capabilities } from "@/lib/capabilities";
import { CartProvider } from "@/components/store/cart-context";
import { CartDrawer } from "@/components/store/cart-drawer";
import { Tracker } from "@/components/store/tracker";
import { Suspense } from "react";
import { Footer, WhatsAppFab } from "@/components/store/footer";
import { Header, MobileTabBar } from "@/components/store/header";
import { getCustomer } from "@/lib/auth";
import { getActiveCategories, getAllCards, getLiveOffers, getLiveSales, salesWithItems } from "@/lib/catalog";
import { money } from "@/lib/format";
import { offerTiers, saleLabel } from "@/lib/pricing";
import { areaLabel } from "@/lib/delivery-area";
import { getSettings } from "@/lib/settings";
import { PREVIEW_MESSAGE, previewMode } from "@/lib/preview";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [settings, categories, customer, offers, liveSales, cards] = await Promise.all([getSettings(), getActiveCategories(), getCustomer(), getLiveOffers(), getLiveSales(), getAllCards()]);
  const sales = salesWithItems(liveSales, cards);
  // The seller's own message leads; live sales and cart offers fill the scrolling bar.
  const announcements = [
    settings.announcement,
    areaLabel(settings) !== "India" ? `Now delivering across ${areaLabel(settings)}` : null,
    "100% original brands at the lowest prices",
    ...sales.map((s) => `${s.name}: ${saleLabel(s).replace("Lowest prices", "lowest prices on")} selected styles`),
    ...offerTiers(offers).map((t) => `${t.label}, get ${t.reward}`),
    "Free delivery on every order",
    settings.codEnabled ? "Cash on delivery available" : null,
    capabilities().whatsapp ? "Order updates on WhatsApp" : null,
  ].filter(Boolean) as string[];
  const nav = categories.map((c) => ({ name: c.name, slug: c.slug, comingSoon: c.comingSoon }));
  return (
    <CartProvider>
      {previewMode() && <div className="bg-madder px-4 py-2 text-center text-xs font-bold tracking-[0.08em] text-white uppercase">{PREVIEW_MESSAGE}</div>}
      <Header categories={nav} announcements={announcements} loggedIn={Boolean(customer)} winter={settings.winterLook} />
      <main>{children}</main>
      <Footer categories={nav} settings={settings} />
      <MobileTabBar loggedIn={Boolean(customer)} />
      <WhatsAppFab number={settings.whatsappNumber} />
      <Suspense fallback={null}><Tracker /></Suspense>
      <CartDrawer />
    </CartProvider>
  );
}
