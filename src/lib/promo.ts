/**
 * A dated campaign with its own poster (e.g. "Weekend Dhamaka"). While it runs, the home page leads with
 * the poster, /sale takes its name and a countdown, and the top strip announces it. Outside its dates the
 * site goes back to normal by itself, so a "weekend" sale is never advertised on a Tuesday.
 * Prices don't change here: the campaign advertises the store's existing below-MRP prices and cart offers.
 */
export type Promo = { name: string; startsAt: number; endsAt: number; poster: string; alt: string; strip: string; /** "Ends Sunday midnight" */ ends: string };

const IST = (d: string) => Date.parse(`${d}+05:30`);

export const PROMOS: Promo[] = [
  {
    name: "Weekend Dhamaka",
    startsAt: IST("2026-11-20T00:00:00"),
    endsAt: IST("2026-11-23T00:00:00"), // the end of Sunday 22 November
    poster: "/promo/weekend-dhamaka-2026-11.jpg",
    alt: "Weekend Dhamaka sale is live: 100% original thermals. Kids' sets from ₹420, men's sets from ₹710, plus up to 7% extra off on family packs. Amul Comfy, Dollar Ultra, Lux Inferno. Free delivery across Delhi NCR.",
    strip: "Weekend Dhamaka is live: ends Sunday midnight",
    ends: "Ends Sunday midnight",
  },
];

export const activePromo = (now = Date.now()) => PROMOS.find((p) => p.startsAt <= now && now < p.endsAt) ?? null;

/** The numbers the campaign quotes, from live prices: "Kids' sets from ₹420", "men's from ₹710", "7%". */
export function promoFacts(cards: { categorySlug: string; price: number; inStock: boolean }[], bestReward: string | null) {
  const from = (slug: string) => {
    const xs = cards.filter((c) => c.inStock && c.categorySlug === slug).map((c) => c.price);
    return xs.length ? Math.min(...xs) : null;
  };
  return { kidsFrom: from("kids-thermals"), menFrom: from("mens-thermals"), extra: bestReward ? bestReward.replace(/ off.*$/, "") : null };
}
export type PromoBar = { name: string; endsAt: number; ends: string; kidsFrom: number | null; menFrom: number | null; extra: string | null };
