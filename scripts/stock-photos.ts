/**
 * Temporary stock photography for the sample catalogue, from Pexels (free to use, including commercially;
 * https://www.pexels.com/license/). These are stand-ins: they show similar products, not the store's actual stock,
 * and must be replaced with real product photos from the admin before selling.
 *
 *   npx tsx scripts/stock-photos.ts            # download into public/seed
 *   npx tsx scripts/stock-photos.ts --apply    # also point the current database's sample listings at them
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve("public/seed");

/** Listing name → Pexels photo IDs (first is the cover). */
export const PRODUCT_PHOTOS: Record<string, number[]> = {
  "Thermal Top Full Sleeve": [20359830, 6667775],
  "High Neck Thermal Top": [20359830, 10430901],
  "Thermal Set, Top & Bottom": [6667775, 20359830],
  "Thermal Bottom": [10430901, 6667775],
  "Baby Thermal Set": [14657994, 3933250],
  "Baby Thermal Bodysuit": [11369390, 18649622],
  "Baby Thermal Romper": [18649622, 11369390],
  "Boys' Thermal Top": [4008828, 8654493],
  "Boys' Thermal Set": [8654549, 1620751],
  "Boys' High Neck Thermal": [8654493, 4008828],
  "Girls' Thermal Set": [4681926, 3661467],
  "Girls' Thermal Top": [3661467, 5893064],
  "Girls' Thermal Leggings": [5893064, 10113046],
  "Women's Thermal Top": [13688061, 6712065],
  "Women's Thermal Set": [719033, 8667732],
  "Classic Cotton Vest": [15072827, 15072833],
  "Sleeveless Gym Vest": [31448632, 15072832],
  "Rib Vest (Pack of 3)": [15072833, 15072827],
  "Cotton Trunks (Pack of 3)": [8874672],
  "Classic Briefs (Pack of 3)": [8874672],
  "Cotton Camisole": [8433551, 6740607],
  "Racerback Slip": [6740607, 8433551],
  "Thermal Socks": [7790150, 6661038],
  "Cotton Crew Socks (Pack of 3)": [9594142, 9594141],
  "Essential Pullover Hoodie": [8217419, 8217415],
  "Oversized Hoodie": [6311503, 10971114],
  "Zip-Up Hoodie": [19805883, 6974928],
};

export const CATEGORY_PHOTOS: Record<string, number> = {
  "mens-thermals": 20359830, "kids-thermals": 4008828, "womens-thermals": 719033, "mens-vests": 15072827,
  "briefs-trunks": 8874672, "womens-innerwear": 8433551, socks: 7790150, hoodies: 8217419,
};

/** Tiles for the kids' shortcuts on the homepage and the kids' category page. */
export const AUDIENCE_PHOTOS: Record<string, number> = { baby: 14657994, boys: 4008828, girls: 4681926 };
export async function audiencePhotos() {
  for (const id of Object.values(AUDIENCE_PHOTOS)) await save(id, `px-${id}-sq.jpg`, 1200, 1200);
}

import { BANNER_PHOTOS } from "../src/lib/home-banners";
export { BANNER_PHOTOS };

const src = (id: number, w: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;
const cache = new Map<string, Buffer>();
async function fetchPhoto(id: number, w = 2400) {
  const key = `${id}:${w}`;
  if (!cache.has(key)) {
    const res = await fetch(src(id, w), { headers: { "User-Agent": "WonderVastra-seed/1.0" }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Pexels photo ${id}: HTTP ${res.status}`);
    cache.set(key, Buffer.from(await res.arrayBuffer()));
  }
  return cache.get(key)!;
}
async function save(id: number, file: string, width: number, height: number) {
  const target = path.join(OUT, file);
  if (!fs.existsSync(target)) {
    await sharp(await fetchPhoto(id)).rotate().resize(width, height, { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 82, mozjpeg: true }).toFile(target);
  }
  return `/seed/${file}`;
}

export const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Product photos at 4:5, the shape every card and product page uses. */
export async function productPhotos(name: string) {
  const ids = PRODUCT_PHOTOS[name] ?? [];
  return Promise.all(ids.map(async (id, i) => ({ url: await save(id, `px-${id}-4x5.jpg`, 1200, 1500), alt: i === 0 ? name : `${name}, styled` })));
}
export async function categoryPhoto(slug: string) {
  const id = CATEGORY_PHOTOS[slug];
  return id ? save(id, `px-${id}-sq.jpg`, 1200, 1200) : null;
}
export async function bannerPhotos() {
  // Only Pexels stand-ins (numbers) are downloaded; the store's own banner photos (names) live in public/seed.
  for (const id of (Object.values(BANNER_PHOTOS) as (string | number)[]).filter((x): x is number => typeof x === "number")) {
    await save(id, `px-${id}-wide.jpg`, 2400, 1100);
    await save(id, `px-${id}-tall.jpg`, 1080, 1350);
  }
}

export function writeCredits() {
  const ids = new Set([...Object.values(PRODUCT_PHOTOS).flat(), ...Object.values(CATEGORY_PHOTOS), ...(Object.values(BANNER_PHOTOS) as (string | number)[]).filter((x): x is number => typeof x === "number"), ...Object.values(AUDIENCE_PHOTOS)]);
  const lines = [...ids].sort((a, b) => a - b).map((id) => `- https://www.pexels.com/photo/${id}/`);
  fs.writeFileSync(path.join(OUT, "CREDITS.md"), `# Sample photo credits\n\nTemporary stand-in photos from Pexels, used under the Pexels License (https://www.pexels.com/license/). They show similar products, not WonderVastra's own. Replace them with your product photos before selling.\n\n${lines.join("\n")}\n`);
}

// CLI: download, and optionally re-point the sample listings in the current database.
if (process.argv[1]?.endsWith("stock-photos.ts")) {
  fs.mkdirSync(OUT, { recursive: true });
  await bannerPhotos();
  await audiencePhotos();
  for (const slug of Object.keys(CATEGORY_PHOTOS)) await categoryPhoto(slug);
  for (const name of Object.keys(PRODUCT_PHOTOS)) await productPhotos(name);
  writeCredits();
  console.log("✓ Stock photos saved to public/seed");

  if (process.argv.includes("--apply")) {
    await import("dotenv/config");
    const { db, schema } = await import("../src/db");
    const { eq } = await import("drizzle-orm");
    const { newId } = await import("../src/lib/utils");
    let n = 0;
    for (const name of Object.keys(PRODUCT_PHOTOS)) {
      const [p] = await db.select().from(schema.products).where(eq(schema.products.name, name));
      if (!p) continue;
      const imgs = await db.select().from(schema.productImages).where(eq(schema.productImages.productId, p.id));
      // Only replace generated sample art; never touch photos the seller uploaded.
      if (imgs.some((im) => !im.url.startsWith("/seed/"))) continue;
      const photos = await productPhotos(name);
      await db.transaction(async (tx) => {
        await tx.delete(schema.productImages).where(eq(schema.productImages.productId, p.id));
        await tx.insert(schema.productImages).values(photos.map((ph, i) => ({ id: newId(), productId: p.id, url: ph.url, alt: ph.alt, sortOrder: i })));
      });
      n++;
    }
    for (const slug of Object.keys(CATEGORY_PHOTOS)) {
      const [c] = await db.select().from(schema.categories).where(eq(schema.categories.slug, slug));
      if (c && (!c.image || c.image.startsWith("/seed/"))) await db.update(schema.categories).set({ image: await categoryPhoto(slug) }).where(eq(schema.categories.id, c.id));
    }
    console.log(`✓ ${n} sample listings now use stock photos`);
  }
  process.exit(0);
}
