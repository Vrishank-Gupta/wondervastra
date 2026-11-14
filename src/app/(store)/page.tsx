import Image from "next/image";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, BadgeCheck, IndianRupee, Star, Tags } from "lucide-react";
import { db, schema } from "@/db";
import { Countdown } from "@/components/store/countdown";
import { CopyCode } from "@/components/store/copy-code";
import { TrustStrip } from "@/components/store/footer";
import { HeroCarousel, type Slide } from "@/components/store/hero-carousel";
import { ProductCard } from "@/components/store/product-card";
import { ProductRail, SectionTitle } from "@/components/store/product-rail";
import { wishedIds } from "@/components/store/listing";
import { BrandTile } from "@/components/store/brand-tile";
import { getActiveBrands, getActiveCategories, getAllCards, getLiveOffers, getLiveSales } from "@/lib/catalog";
import { isLive } from "@/lib/pricing";
import { money } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { AUDIENCES, bannerSrc } from "@/lib/home-banners";

export default async function Home() {
  const [settings, categories, brands, cards, sales, offers, wished, topReviews, coupons] = await Promise.all([
    getSettings(), getActiveCategories(), getActiveBrands(), getAllCards(), getLiveSales(), getLiveOffers(), wishedIds(),
    db.select().from(schema.reviews).where(eq(schema.reviews.status, "approved")).orderBy(desc(schema.reviews.rating), desc(schema.reviews.createdAt)).limit(12),
    db.select().from(schema.coupons).where(eq(schema.coupons.active, true)).orderBy(desc(schema.coupons.createdAt)),
  ]);
  const now = Date.now();
  const buyable = cards.filter((c) => c.inStock);
  const bestsellers = buyable.filter((c) => c.featured || c.tags.includes("bestseller")).slice(0, 10);
  const fresh = [...buyable].sort((a, b) => Number(b.tags.includes("new")) - Number(a.tags.includes("new")) || b.createdAt - a.createdAt).slice(0, 10);
  const house = brands.find((b) => b.isHouse) ?? null;
  const houseItems = house ? cards.filter((c) => c.brandId === house.id) : [];
  const partners = brands.filter((b) => !b.isHouse);
  // House-label drops get their own section, so the generic rail only shows partner-brand launches.
  const soon = cards.filter((c) => c.comingSoon && !c.isHouse);
  const sale = sales[0];
  const saleItems = buyable.filter((c) => c.saleName === sale?.name).slice(0, 10);
  const shownCoupons = coupons.filter((c) => isLive(c, now) && (c.usageLimit == null || c.usedCount < c.usageLimit) && c.description).slice(0, 2);
  const quotes = topReviews.filter((r) => r.rating >= 4 && r.body).slice(0, 3);
  const catImage = (slug: string) => {
    const c = categories.find((x) => x.slug === slug);
    return c ? c.image ?? cards.find((p) => p.categoryId === c.id)?.images[0]?.url ?? null : null;
  };
  const daysLeft = sale ? Math.max(1, Math.ceil((sale.endsAt - now) / 86_400_000)) : 0;

  const saleScope = sale ? (sale.scope === "all" ? "everything" : sale.scope === "category" ? categories.filter((c) => sale.targetIds.includes(c.id)).map((c) => c.name.toLowerCase()).join(" and ") || "selected styles" : sale.scope === "brand" ? brands.filter((b) => sale.targetIds.includes(b.id)).map((b) => b.name).join(" and ") || "selected brands" : "selected styles") : "";
  const slides: Slide[] = [
    ...(categories.some((c) => c.slug === "kids-thermals" && !c.comingSoon) ? [{ key: "kids", eyebrow: "Baby (0+), boys & girls", title: "Kids' thermals",
      text: "Soft, warm layers for little ones. 100% original brands at the lowest prices.", cta: "Shop kids'", href: "/c/kids-thermals",
      ...bannerSrc("kids"), alt: "Baby in a white long-sleeve top and red beanie" }] : []),
    ...(sale ? [{
      key: "sale", eyebrow: `Ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`, title: sale.name,
      text: `${sale.type === "percent" ? `${sale.value}% off` : `${money(sale.value)} off`} ${saleScope}.`, cta: "Shop the sale", href: "/sale",
      ...bannerSrc("sale"), alt: "Man in warm winter wear outdoors in the snow",
    }] : []),
    ...(partners.length > 0 ? [{ key: "brands", eyebrow: `${partners.length} trusted ${partners.length === 1 ? "brand" : "brands"}`, title: "Brands you know",
      text: `${partners.slice(0, 4).map((b) => b.name).join(", ")}${partners.length > 4 ? " and more" : ""}. Genuine stock, one cart.`, cta: "Shop by brand", href: "/brands",
      ...bannerSrc("brands"), alt: "Man in a white cotton vest" }] : []),
    ...(house ? [{ key: "label", eyebrow: houseItems.some((c) => !c.comingSoon) ? "Our own label" : "Coming soon", title: house.name,
      text: house.tagline ?? "Our own label.", cta: houseItems.some((c) => !c.comingSoon) ? "Shop the label" : "Get notified", href: `/brands/${house.slug}`,
      ...bannerSrc("label"), alt: "Man in a plain white hoodie" }] : []),
  ];

  const promos = [
    { slug: "kids-thermals", title: "Kids' thermals", text: "Baby (0+), boys and girls" },
    { slug: "mens-thermals", title: "Men's thermals", text: "Warm base layers for winter" },
  ].filter((p) => catImage(p.slug) && categories.some((c) => c.slug === p.slug && !c.comingSoon));
  const kidsCat = categories.find((c) => c.slug === "kids-thermals" && !c.comingSoon);
  const kidsItems = kidsCat ? buyable.filter((c) => c.categoryId === kidsCat.id).slice(0, 10) : [];
  const audiences = AUDIENCES.filter((a) => cards.some((c) => c.categoryId === kidsCat?.id && c.tags.includes(a.tag)));
  const launching = categories.filter((c) => c.comingSoon && !houseItems.some((h) => h.categoryId === c.id));

  return (
    <>
      <h1 className="sr-only">WonderVastra: 100% original branded kids' and men's thermals at the lowest prices</h1>
      <HeroCarousel slides={slides} />

      {kidsCat && audiences.length > 0 && (
        <section aria-label="Kids' thermals" className="container-x pt-8 sm:pt-12">
          <p className="eyebrow text-madder">Our hero range · Baby (0+), boys &amp; girls</p>
          <SectionTitle title="Kids' thermals" href="/c/kids-thermals" cta="Shop all kids'" />
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {audiences.map((a) => (
              <Link key={a.tag} href={`/c/kids-thermals?collection=${a.tag}`} className="group relative block aspect-[4/5] overflow-hidden bg-sand-soft sm:aspect-[5/4]">
                <Image src={a.img} alt="" fill sizes="33vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-5">
                  <span className="font-display block text-3xl leading-none sm:text-5xl">{a.label}</span>
                  <span className="mt-1 block text-xs text-white/85 sm:text-sm">{a.sub}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {kidsItems.length > 0 && <ProductRail title="Kids' favourites" href="/c/kids-thermals" products={kidsItems} wished={wished} />}



      <section aria-label="Our promise" className="mt-12 bg-ink text-white sm:mt-16">
        <div className="container-x grid gap-6 py-8 sm:py-10 lg:grid-cols-[1.1fr_2fr] lg:items-center lg:gap-10">
          <p className="font-display text-[2.6rem] leading-[0.92] uppercase sm:text-6xl">
            100% original.<br /><span className="text-madder">Lowest prices.</span>
          </p>
          <ul className="grid gap-5 sm:grid-cols-3">
            {[
              { icon: BadgeCheck, title: "Only the real thing", text: "Genuine stock from the brands you already trust. No copies, ever." },
              { icon: IndianRupee, title: "Lowest prices", text: "Always below MRP, with extra savings on bigger carts and packs." },
              { icon: Tags, title: "Big brands, one cart", text: `${partners.slice(0, 3).map((b) => b.name).join(", ") || "Top brands"}${partners.length > 3 ? " and more" : ""}, delivered together.` },
            ].map((i) => (
              <li key={i.title} className="flex gap-3">
                <i.icon size={26} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-madder" />
                <span><b className="block text-[13px] tracking-[0.06em] uppercase">{i.title}</b><span className="text-sm text-white/70">{i.text}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {(offers.length > 0 || shownCoupons.length > 0) && (
        <section aria-label="Offers" className="border-b border-line">
          <div className="container-x py-3"><div className="rail lg:grid lg:grid-flow-col lg:auto-cols-fr">
            {[...offers].sort((a, b) => a.minSubtotal - b.minSubtotal).map((o) => (
              <div key={o.id} className="flex min-w-[15rem] shrink-0 items-center gap-3 border border-dashed border-ink/40 px-4 py-3">
                <span className="font-display text-3xl leading-none text-madder">{o.type === "free_shipping" ? "Free" : o.type === "percent" ? `${o.value}%` : money(o.value)}</span>
                <span className="text-xs leading-snug"><b className="block text-[13px] uppercase">{o.type === "free_shipping" ? "Delivery" : "Off your cart"}</b>on orders above {money(o.minSubtotal)}</span>
              </div>
            ))}
            {shownCoupons.map((c) => (
              <div key={c.id} className="flex min-w-[17rem] shrink-0 items-center justify-between gap-3 border border-dashed border-ink/40 px-4 py-3">
                <span className="text-xs leading-snug"><b className="block text-[13px] uppercase">{c.description}</b>Use code at checkout</span>
                <CopyCode code={c.code} />
              </div>
            ))}
          </div></div>
        </section>
      )}

      {promos.length > 0 && (
        <section className="container-x grid gap-3 pt-12 sm:grid-cols-2 sm:pt-16">
          {promos.map((p) => (
            <Link key={p.slug} href={`/c/${p.slug}`} className="group relative block aspect-[4/3] overflow-hidden bg-sand-soft sm:aspect-[5/4] lg:aspect-[16/11]">
              <Image src={catImage(p.slug)!} alt="" fill sizes="(max-width:640px) 100vw, 50vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
                <span className="font-display block text-4xl sm:text-5xl">{p.title}</span>
                <span className="mt-1 block text-sm text-white/85">{p.text}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold tracking-[0.1em] uppercase underline underline-offset-4">Shop now <ArrowRight size={14} aria-hidden /></span>
              </span>
            </Link>
          ))}
        </section>
      )}

      {partners.length > 0 && (
        <section className="container-x pt-12 sm:pt-16">
          <SectionTitle title="Shop by brand" href="/brands" cta="All brands" />
          <div className="rail lg:grid lg:grid-cols-[repeat(var(--n),minmax(0,1fr))] lg:gap-3" style={{ "--n": Math.min(5, partners.length + (house ? 1 : 0)) } as React.CSSProperties}>
            {[...(house ? [house] : []), ...partners].slice(0, 10).map((b) => (
              <div key={b.id} className="w-[40%] shrink-0 sm:w-[28%] lg:w-auto"><BrandTile brand={b} /></div>
            ))}
          </div>
        </section>
      )}

      <ProductRail title="Bestsellers" href="/shop" products={bestsellers} wished={wished} />

      {sale && saleItems.length > 0 && (
        <section className="pt-12 sm:pt-16">
          <div className="bg-madder text-white">
            <div className="container-x flex flex-wrap items-center justify-between gap-x-10 gap-y-5 py-8 sm:py-10">
              <div>
                <p className="eyebrow text-white/80">Limited time · {sale.type === "percent" ? `${sale.value}% off` : `${money(sale.value)} off`}</p>
                <h2 className="mt-1 text-5xl sm:text-7xl">{sale.name}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                <Countdown endsAt={sale.endsAt} dark />
                <Link href="/sale" className="btn bg-white text-ink hover:bg-ink hover:text-white">Shop the sale <ArrowRight size={16} aria-hidden /></Link>
              </div>
            </div>
          </div>
          <div className="container-x pt-5">
            <div className="rail">
              {saleItems.map((p) => (
                <div key={p.id} className="w-[44%] shrink-0 sm:w-[30%] lg:w-[calc((100%-3*0.75rem)/4)] xl:w-[calc((100%-4*0.75rem)/5)]">
                  <ProductCard p={p} wished={wished.includes(p.id)} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {house && houseItems.length > 0 && (
        <section className="mt-12 bg-ink pb-12 text-white sm:mt-16 sm:pb-16">
          <div className="container-x flex flex-wrap items-end justify-between gap-4 pt-10 sm:pt-14">
            <div>
              <p className="eyebrow text-white/70">Our own label{houseItems.every((c) => c.comingSoon) ? " · Coming soon" : ""}</p>
              <h2 className="mt-1 text-5xl sm:text-7xl">{house.name}</h2>
              {house.tagline && <p className="mt-2 max-w-md text-white/75">{house.tagline}</p>}
            </div>
            <Link href={`/brands/${house.slug}`} className="btn bg-white text-ink hover:bg-madder hover:text-white">Explore the label <ArrowRight size={16} aria-hidden /></Link>
          </div>
          <div className="container-x pt-6">
            <div className="rail">
              {houseItems.slice(0, 10).map((p) => (
                <div key={p.id} className="w-[44%] shrink-0 sm:w-[30%] lg:w-[calc((100%-3*0.75rem)/4)] [&_.text-ink-soft]:text-white/70 [&_.text-slate]:text-white/80">
                  <ProductCard p={p} wished={wished.includes(p.id)} />
                </div>
              ))}
            </div>
            {houseItems.some((c) => c.comingSoon) && <p className="mt-4 text-sm text-white/70">Tap any piece and choose “Notify me” to hear the day it drops.</p>}
          </div>
        </section>
      )}

      <ProductRail title="New in" href="/shop?sort=new" products={fresh} wished={wished} />

      {soon.length > 0 && (
        <section className="mt-12 bg-sand-soft pb-12 sm:mt-16 sm:pb-16">
          <ProductRail title="Launching soon" products={soon} wished={wished} />
          <p className="container-x mt-4 text-sm text-ink-soft">
            {launching.length > 0 && <>{launching.map((c) => c.name).join(", ").replace(/, ([^,]*)$/, " and $1")} are on the way. </>}Tap any item and choose “Notify me” to hear the day it launches.
          </p>
        </section>
      )}

      {quotes.length > 0 && (
        <section className="container-x pt-12 sm:pt-16">
          <SectionTitle title="What buyers say" />
          <div className="grid gap-3 md:grid-cols-3">
            {quotes.map((r) => (
              <figure key={r.id} className="bg-sand-soft p-5">
                <div className="flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>{Array.from({ length: r.rating }).map((_, i) => <Star key={i} size={15} className="fill-ink" aria-hidden />)}</div>
                <blockquote className="mt-3 text-[15px] leading-relaxed">{r.body}</blockquote>
                <figcaption className="mt-3 text-xs font-bold tracking-[0.06em] uppercase">{r.name} · Verified buyer</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <div className="pt-12 sm:pt-16"><TrustStrip settings={settings} /></div>
    </>
  );
}
