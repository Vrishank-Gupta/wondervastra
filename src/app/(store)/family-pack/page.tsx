import type { Metadata } from "next";
import { getBuyables } from "@/lib/buyables";
import { getLiveOffers } from "@/lib/catalog";
import { offerTiers } from "@/lib/pricing";
import { FamilyPack } from "@/components/store/family-pack";

export const metadata: Metadata = {
  title: "Family pack: thermals for everyone in one go",
  description: "Pick a thermal for each person in your family, kids and adults, and add them all to your cart together. Extra savings on 3, 4, 5 and 7 pieces.",
  alternates: { canonical: "/family-pack", types: { "text/markdown": "/family-pack.md" } },
};

export default async function FamilyPackPage() {
  const [items, offers] = await Promise.all([getBuyables(), getLiveOffers()]);
  const tiers = offerTiers(offers).filter((t) => t.minPieces > 0);
  return (
    <div className="container-x py-6 sm:py-10">
      <p className="eyebrow text-madder">Whole family, one order</p>
      <h1 className="text-4xl sm:text-5xl">Family pack</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Add a row for each person, pick their thermal and size, and put everything in your cart in one tap.
        {tiers.length > 0 && <> More pieces means more off: {tiers.map((t) => `${t.minPieces} pieces ${t.reward.replace(/ off.*$/, "")}`).join(", ")} extra, on top of our prices.</>}
      </p>
      <FamilyPack
        products={items.map((b) => ({
          id: b.id, slug: b.slug, name: b.fullName, kids: b.kids, image: b.images[0] ?? null, minPieces: b.minPieces, sizes: b.sizes, picks: b.picks,
          choices: b.choices.map((c) => ({ pick: c.pick, size: c.size, ids: c.variantIds, pieces: c.pieces, price: c.price, mrp: c.mrp, stock: c.stock })),
        }))}
        tiers={tiers.map((t) => ({ pieces: t.minPieces, reward: t.reward }))}
      />
    </div>
  );
}
