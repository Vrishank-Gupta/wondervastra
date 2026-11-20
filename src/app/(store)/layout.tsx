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
import { activePromo, promoFacts, type PromoBar } from "@/lib/promo";
import { PromoRibbon } from "@/components/store/promo-ribbon";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [settings, categories, customer, offers, liveSales, cards] = await Promise.all([getSettings(), getActiveCategories(), getCustomer(), getLiveOffers(), getLiveSales(), getAllCards()]);
  const sales = salesWithItems(liveSales, cards);
  // The seller's own message leads; live sales and cart offers fill the scrolling bar.
  // While a dated campaign runs, it replaces the seller's own message (which may name an older sale).
  const promo = activePromo();
  const announcements = [
    promo ? promo.strip : settings.announcement,
    areaLabel(settings) !== "India" ? `Now delivering across ${areaLabel(settings)}` : null,
    "100% original brands, always below MRP",
    ...sales.map((s) => `${s.name}: ${saleLabel(s).replace("Special prices", "special prices on")} selected styles`),
    ...offerTiers(offers).map((t) => `${t.label}, get an extra ${t.reward}`),
    "Free delivery on every order",
    settings.codEnabled ? "Cash on delivery available" : null,
    capabilities().whatsapp ? "Order updates on WhatsApp" : null,
  ].filter(Boolean) as string[];
  const promoBar: PromoBar | null = promo ? { name: promo.name, endsAt: promo.endsAt, ends: promo.ends, ...promoFacts(cards, offerTiers(offers).at(-1)?.reward ?? null) } : null;
  const nav = categories.map((c) => ({ name: c.name, slug: c.slug, comingSoon: c.comingSoon }));
  return (
    <CartProvider>
      {previewMode() && <div className="bg-madder px-4 py-2 text-center text-xs font-bold tracking-[0.08em] text-white uppercase">{PREVIEW_MESSAGE}</div>}
      <Header categories={nav} announcements={announcements} loggedIn={Boolean(customer)} winter={settings.winterLook} sale={promoBar?.name} ribbon={promoBar ? <PromoRibbon promo={promoBar} /> : undefined} />
      {/* data-promo switches on campaign-only touches (e.g. the sticker on product cards) via CSS. */}
      <main data-promo={promoBar ? "on" : undefined}>{children}</main>
      <Footer categories={nav} settings={settings} />
      <MobileTabBar loggedIn={Boolean(customer)} />
      <WhatsAppFab number={settings.whatsappNumber} />
      <Suspense fallback={null}><Tracker /></Suspense>
      <CartDrawer />
    </CartProvider>
  );
}
