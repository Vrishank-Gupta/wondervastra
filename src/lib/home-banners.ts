/**
 * Homepage banner images (temporary Pexels stand-ins, see scripts/stock-photos.ts).
 * Filenames carry the photo ID, so swapping a photo never shows a cached old one.
 */
export const BANNER_PHOTOS = { sale: 6667775, kids: 14657994, brands: 15072827, label: 8217419 } as const;
/** Kids' shortcut tiles (square), keyed by the listing tag they filter on. */
export const AUDIENCES = [
  { tag: "baby", label: "Baby", sub: "0–24 months", img: "/seed/px-14657994-sq.jpg" },
  { tag: "boys", label: "Boys", sub: "2–14 years", img: "/seed/px-4008828-sq.jpg" },
  { tag: "girls", label: "Girls", sub: "2–14 years", img: "/seed/px-4681926-sq.jpg" },
] as const;
export const bannerSrc = (key: keyof typeof BANNER_PHOTOS) => ({
  wide: `/seed/px-${BANNER_PHOTOS[key]}-wide.jpg`,
  tall: `/seed/px-${BANNER_PHOTOS[key]}-tall.jpg`,
});
