import type { Metadata } from "next";
import { Tag } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Countdown } from "@/components/store/countdown";
import { filtersFromParams, Listing } from "@/components/store/listing";
import { CopyCode } from "@/components/store/copy-code";
import { getAllCards, getLiveOffers, getLiveSales, salesWithItems } from "@/lib/catalog";
import { isLive, isOpenEnded, saleLabel } from "@/lib/pricing";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Offers & sales", description: "Live discounts, coupons and limited-time sales on original branded thermals at WonderVastra.", alternates: { canonical: "/sale" } };

export default async function SalePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [cards, allSales, offers, coupons] = await Promise.all([
    getAllCards(), getLiveSales(), getLiveOffers(),
    db.select().from(schema.coupons).where(eq(schema.coupons.active, true)).orderBy(desc(schema.coupons.createdAt)),
  ]);
  const now = Date.now();
  const sales = salesWithItems(allSales, cards);
  const shown = coupons.filter((c) => isLive(c, now) && (c.usageLimit == null || c.usedCount < c.usageLimit) && c.description);
  const onOffer = cards.filter((c) => c.discountPct > 0);
  return (
    <>
      <div className="bg-madder text-white">
        <div className="container-x py-8 sm:py-12">
          <h1 className="text-6xl sm:text-8xl">Sale &amp; offers</h1>
          <p className="mt-2 text-white/85">Every live deal in one place. Applied automatically at checkout, except coupons.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sales.map((s) => (
              <div key={s.id} className="flex bg-white text-ink flex-col gap-2 p-4">
                <p className="font-display text-2xl">{s.name}</p>
                <p className="text-sm text-ink-soft">{saleLabel(s).replace("Lowest prices", "Lowest prices on")} selected styles</p>
                {!isOpenEnded(s.endsAt) && <Countdown endsAt={s.endsAt} />}
              </div>
            ))}
            {offers.map((o) => (
              <div key={o.id} className="flex bg-white text-ink items-center gap-3 p-4"><Tag size={18} strokeWidth={1.5} aria-hidden className="shrink-0" /><div><p className="font-semibold">{o.name}</p><p className="text-xs text-ink-soft">{o.minPieces ? `Pick any ${o.minPieces} pieces. Applied automatically in your cart` : `Applied automatically on carts above ${money(o.minSubtotal)}`}</p></div></div>
            ))}
            {shown.map((c) => (
              <div key={c.id} className="flex bg-white text-ink items-center justify-between gap-3 p-4">
                <div><p className="font-semibold">{c.description}</p><p className="text-xs text-ink-soft">{c.minSubtotal ? `On orders above ${money(c.minSubtotal)}` : "Enter the code at checkout"}</p></div>
                <CopyCode code={c.code} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="container-x py-6"><Listing cards={onOffer} filters={filtersFromParams(await searchParams)} empty={{ title: "No sale items right now", text: "The offers above still apply to everything in the store." }} /></div>
    </>
  );
}
