import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { hashPassword } from "../src/lib/passwords";
import { newId } from "../src/lib/utils";
import { audiencePhotos, bannerPhotos, categoryPhoto, productPhotos, writeCredits } from "./stock-photos";

const OUT = path.resolve("public/seed");
fs.mkdirSync(OUT, { recursive: true });

const C = {
  white: { name: "White", hex: "#F7F7F5" },
  offwhite: { name: "Off White", hex: "#EFE8DA" },
  black: { name: "Black", hex: "#1F1E1D" },
  charcoal: { name: "Charcoal", hex: "#3B3A38" },
  grey: { name: "Grey Melange", hex: "#9A9A98" },
  navy: { name: "Navy", hex: "#2B3A4A" },
  maroon: { name: "Maroon", hex: "#6E2A2A" },
  olive: { name: "Olive", hex: "#5A6650" },
  skin: { name: "Skin", hex: "#CBA685" },
  pink: { name: "Pink", hex: "#E7B7C2" },
  skyblue: { name: "Sky Blue", hex: "#A9C8E0" },
  assorted: { name: "Assorted", hex: "#8C3B2E" },
} as const;
type ColorKey = keyof typeof C;

/** Partner brands are placeholders standing in for the real ones the store will stock. */
const BRANDS = [
  { slug: "wondervastra-originals", name: "WonderVastra Originals", tagline: "Our own label. Hoodies first, more soon.", house: true },
  { slug: "lux", name: "Lux", tagline: "Thermals for kids and men" },
  { slug: "amul", name: "Amul", tagline: "Everyday thermals" },
  { slug: "rupa", name: "Rupa", tagline: "Winter wear for the family" },
  { slug: "dollar", name: "Dollar", tagline: "Warm, everyday thermals" },
] as const;

// Only these ranges are on the site for now (kids' first, as the hero range). The rest are seeded switched off
// (category inactive, listings archived) so the owner can bring each back from the admin when stock arrives.
const SHOWN = new Set(["kids-thermals", "mens-thermals"]);
const CATEGORIES = [
  { slug: "kids-thermals", name: "Kids' Thermals", tagline: "Baby (0–24 months), boys and girls", hsn: "6111" },
  { slug: "mens-thermals", name: "Men's Thermals", tagline: "Warm base layers for winter", hsn: "6107" },
  { slug: "womens-thermals", name: "Women's Thermals", tagline: "Slim, warm layers under anything", hsn: "6108" },
  { slug: "mens-vests", name: "Men's Vests", tagline: "Cotton vests for daily wear", hsn: "6109" },
  { slug: "briefs-trunks", name: "Briefs & Trunks", tagline: "Everyday comfort, packs that last", hsn: "6107" },
  { slug: "womens-innerwear", name: "Women's Innerwear", tagline: "Camisoles and slips", hsn: "6108" },
  { slug: "socks", name: "Socks", tagline: "Daily and winter socks", hsn: "6115" },
  { slug: "hoodies", name: "Hoodies", tagline: "From our own label", hsn: "6110" },
] as const;

type Seed = {
  name: string; brand: string; cat: string; colors: ColorKey[]; sizes?: string[];
  price: number; mrp?: number; free?: boolean; charge?: number; stock?: number; tags?: string[]; featured?: boolean;
  short: string; material: string; maxOrder?: number; maxCustomer?: number; cod?: boolean; forceOut?: boolean; soon?: string; returnable?: boolean;
};
const MEN = ["S (80 cm)", "M (85 cm)", "L (90 cm)", "XL (95 cm)", "XXL (100 cm)"];
const WOMEN = ["S", "M", "L", "XL"];
const HOODIE = ["S", "M", "L", "XL", "XXL"];
const SOCK = ["Free size"];
const BABY = ["0–6 M", "6–12 M", "12–18 M", "18–24 M"];
const KIDS = ["2–4 Y", "4–6 Y", "6–8 Y", "8–10 Y", "10–12 Y", "12–14 Y"];
const SOON = "Coming soon";
const THERMAL = "Cotton-polyester with brushed inner";
const SOFT = "Soft cotton-rich knit with brushed inner, gentle on skin";
const PRODUCTS: Seed[] = [
  // Live now: men's thermals.
  { name: "Thermal Top Full Sleeve", brand: "lux", cat: "mens-thermals", colors: ["charcoal", "black", "offwhite"], sizes: MEN, price: 549, mrp: 649, tags: ["winter", "bestseller"], featured: true, stock: 60, short: "A brushed-inside thermal top for cold mornings.", material: THERMAL },
  { name: "High Neck Thermal Top", brand: "dollar", cat: "mens-thermals", colors: ["grey", "black", "navy"], sizes: MEN, price: 599, cod: false, tags: ["winter", "new"], stock: 40, short: "A warm high neck that layers under jackets and sweaters. Prepaid only.", material: THERMAL },
  { name: "Thermal Set, Top & Bottom", brand: "amul", cat: "mens-thermals", colors: ["charcoal", "maroon"], sizes: MEN, price: 999, mrp: 1199, free: true, tags: ["winter", "value", "bestseller"], featured: true, stock: 35, maxOrder: 3, maxCustomer: 6, short: "A matching top and bottom for full winter warmth. Limit 3 per order.", material: THERMAL },
  { name: "Thermal Bottom", brand: "rupa", cat: "mens-thermals", colors: ["charcoal", "black"], sizes: MEN, price: 449, tags: ["winter"], stock: 4, short: "Slim thermal leggings that fit under jeans and trousers.", material: THERMAL },

  // Live now: kids' thermals (baby 0+, boys, girls).
  { name: "Baby Thermal Set", brand: "lux", cat: "kids-thermals", colors: ["offwhite", "skyblue", "pink"], sizes: BABY, price: 399, mrp: 449, tags: ["kids", "baby", "winter", "bestseller"], featured: true, stock: 48, short: "A soft top and bottom set for babies, with easy shoulder buttons.", material: SOFT },
  { name: "Baby Thermal Bodysuit", brand: "amul", cat: "kids-thermals", colors: ["white", "pink"], sizes: BABY, price: 349, tags: ["kids", "baby", "winter", "new"], stock: 40, short: "A one-piece thermal with snap buttons for quick changes.", material: SOFT },
  { name: "Baby Thermal Romper", brand: "dollar", cat: "kids-thermals", colors: ["offwhite", "skyblue"], sizes: BABY, price: 449, tags: ["kids", "baby", "winter"], stock: 24, short: "Full-length warmth from neck to toe for the coldest nights.", material: SOFT },
  { name: "Boys' Thermal Top", brand: "rupa", cat: "kids-thermals", colors: ["navy", "grey", "maroon"], sizes: KIDS, price: 299, tags: ["kids", "boys", "winter", "bestseller"], featured: true, stock: 72, short: "A warm full-sleeve top for school mornings and play.", material: THERMAL },
  { name: "Boys' Thermal Set", brand: "dollar", cat: "kids-thermals", colors: ["navy", "charcoal"], sizes: KIDS, price: 549, mrp: 649, tags: ["kids", "boys", "winter", "value"], stock: 36, short: "A matching top and bottom that layers under uniforms.", material: THERMAL },
  { name: "Boys' High Neck Thermal", brand: "lux", cat: "kids-thermals", colors: ["black", "grey"], sizes: KIDS, price: 349, tags: ["kids", "boys", "winter", "new"], stock: 30, short: "A high neck to keep chilly winds out.", material: THERMAL },
  { name: "Girls' Thermal Set", brand: "lux", cat: "kids-thermals", colors: ["pink", "maroon", "skin"], sizes: KIDS, price: 549, mrp: 649, tags: ["kids", "girls", "winter", "bestseller"], featured: true, stock: 54, short: "A soft top and leggings set that stays warm all day.", material: THERMAL },
  { name: "Girls' Thermal Top", brand: "rupa", cat: "kids-thermals", colors: ["pink", "skin", "white"], sizes: KIDS, price: 299, tags: ["kids", "girls", "winter"], stock: 54, short: "A slim full-sleeve top that fits under frocks and kurtas.", material: THERMAL },
  { name: "Girls' Thermal Leggings", brand: "amul", cat: "kids-thermals", colors: ["skin", "black"], sizes: KIDS, price: 249, tags: ["kids", "girls", "winter", "new"], stock: 0, short: "Thin, warm leggings to layer under skirts and salwars.", material: THERMAL },

  // Coming soon: everything else.
  { name: "Women's Thermal Top", brand: "lux", cat: "womens-thermals", soon: SOON, colors: ["skin", "black", "maroon"], sizes: WOMEN, price: 549, mrp: 649, tags: ["winter"], stock: 50, short: "A slim, warm top that disappears under kurtis and sweaters.", material: THERMAL },
  { name: "Women's Thermal Set", brand: "amul", cat: "womens-thermals", soon: SOON, colors: ["skin", "pink"], sizes: WOMEN, price: 949, mrp: 1149, free: true, tags: ["winter", "value"], stock: 30, short: "A matching top and leggings, soft and close-fitting.", material: THERMAL },
  { name: "Classic Cotton Vest", brand: "lux", cat: "mens-vests", soon: SOON, colors: ["white"], sizes: MEN, price: 149, mrp: 165, tags: ["everyday"], stock: 120, short: "The everyday white vest: soft, breathable and easy under shirts.", material: "100% cotton rib" },
  { name: "Sleeveless Gym Vest", brand: "rupa", cat: "mens-vests", soon: SOON, colors: ["white", "black", "grey"], sizes: MEN, price: 199, tags: ["sport"], stock: 60, short: "A deeper armhole for workouts and hot days.", material: "Cotton-spandex blend" },
  { name: "Rib Vest (Pack of 3)", brand: "amul", cat: "mens-vests", soon: SOON, colors: ["white"], sizes: MEN, price: 399, mrp: 450, tags: ["value"], stock: 45, short: "Three everyday rib vests at a better price.", material: "100% cotton rib" },
  { name: "Cotton Trunks (Pack of 3)", brand: "lux", cat: "briefs-trunks", soon: SOON, colors: ["assorted"], sizes: MEN, price: 449, mrp: 525, tags: ["value"], stock: 50, returnable: false, short: "Soft trunks with a covered waistband. Colours may vary.", material: "Cotton-elastane" },
  { name: "Classic Briefs (Pack of 3)", brand: "amul", cat: "briefs-trunks", soon: SOON, colors: ["assorted"], sizes: MEN, price: 299, mrp: 345, tags: ["value"], stock: 70, returnable: false, short: "Everyday briefs with a soft outer elastic.", material: "100% cotton" },
  { name: "Cotton Camisole", brand: "lux", cat: "womens-innerwear", soon: SOON, colors: ["white", "skin", "black"], sizes: WOMEN, price: 249, tags: ["everyday"], stock: 45, returnable: false, short: "A soft, adjustable-strap camisole for everyday layering.", material: "Cotton-spandex" },
  { name: "Racerback Slip", brand: "amul", cat: "womens-innerwear", soon: SOON, colors: ["white", "skin"], sizes: WOMEN, price: 229, tags: ["everyday"], stock: 35, returnable: false, short: "A smooth racerback slip that sits flat under kurtis and tees.", material: "Cotton-modal blend" },
  { name: "Thermal Socks", brand: "lux", cat: "socks", soon: SOON, colors: ["charcoal", "navy", "maroon"], sizes: SOCK, price: 199, tags: ["winter"], stock: 60, short: "Thick, warm socks for cold nights.", material: "Wool-acrylic blend with brushed inner" },
  { name: "Cotton Crew Socks (Pack of 3)", brand: "dollar", cat: "socks", soon: SOON, colors: ["assorted"], sizes: SOCK, price: 249, mrp: 299, tags: ["everyday", "value"], stock: 80, short: "Three pairs of everyday crew socks.", material: "Combed cotton blend" },

  { name: "Essential Pullover Hoodie", brand: "wondervastra-originals", cat: "hoodies", soon: "Launching this winter", colors: ["offwhite", "black", "olive"], sizes: HOODIE, price: 1299, tags: ["new", "winter"], featured: true, stock: 40, short: "Our first piece: a heavyweight fleece hoodie with a clean, logo-free front.", material: "Cotton-rich fleece, 320 GSM" },
  { name: "Oversized Hoodie", brand: "wondervastra-originals", cat: "hoodies", soon: "Launching this winter", colors: ["grey", "black"], sizes: HOODIE, price: 1499, tags: ["new", "winter"], stock: 30, short: "A dropped shoulder and roomy fit for layering.", material: "Cotton-rich fleece, 320 GSM" },
  { name: "Zip-Up Hoodie", brand: "wondervastra-originals", cat: "hoodies", soon: "Launching this winter", colors: ["navy", "offwhite"], sizes: HOODIE, price: 1599, tags: ["new", "winter"], stock: 25, short: "A full-zip fleece for easy on and off.", material: "Cotton-rich fleece, 320 GSM" },
];

async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || "owner@vastravibe.in").toLowerCase();
  const [exists] = await db.select().from(schema.admins).where(eq(schema.admins.email, email));
  if (exists) return console.log(`✓ Admin exists: ${email}`);
  const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString("base64url");
  await db.insert(schema.admins).values({ id: newId(), email, name: "Owner", passwordHash: await hashPassword(password), role: "owner" });
  console.log(`✓ Admin created: ${email}`);
  if (!process.env.ADMIN_PASSWORD) console.log(`  Password: ${password}  (shown once, save it now)`);
}

await ensureAdmin();

const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.products);
if (Number(n) > 0) {
  console.log("✓ Catalogue already has products, skipping sample data");
  process.exit(0);
}

// Temporary stock photos (see scripts/stock-photos.ts). Replace with real product photos before selling.
await bannerPhotos();
await audiencePhotos();
writeCredits();

const catIds = new Map<string, string>();
for (const [i, c] of CATEGORIES.entries()) {
  const id = newId();
  catIds.set(c.slug, id);
  const image = await categoryPhoto(c.slug);
  await db.insert(schema.categories).values({ id, name: c.name, slug: c.slug, tagline: c.tagline, image, sortOrder: i, active: SHOWN.has(c.slug) });
}
const brandIds = new Map<string, string>();
for (const [i, b] of BRANDS.entries()) {
  const id = newId();
  brandIds.set(b.slug, id);
  await db.insert(schema.brands).values({ id, name: b.name, slug: b.slug, tagline: b.tagline, isHouse: "house" in b && b.house, sortOrder: i });
}

const GUIDES: Record<string, string> = {
  men: "Chest / waist in cm\nS: 80 · M: 85 · L: 90 · XL: 95 · XXL: 100\nBetween sizes? Pick the larger one.",
  women: "Bust in inches\nS: 30–32 · M: 32–34 · L: 34–36 · XL: 36–38",
  hoodie: "Chest in inches (garment)\nS: 40 · M: 42 · L: 44 · XL: 46 · XXL: 48",
  sock: "Free size: fits UK 6–10.",
  baby: "Age guide, check length too\n0–6 M: up to 67 cm · 6–12 M: 67–76 cm · 12–18 M: 76–83 cm · 18–24 M: 83–90 cm",
  kids: "Age guide, check height too\n2–4 Y: 92–104 cm · 4–6 Y: 104–116 cm · 6–8 Y: 116–128 cm · 8–10 Y: 128–140 cm · 10–12 Y: 140–152 cm · 12–14 Y: 152–164 cm",
};
const CARE = "Machine wash cold with similar colours. Do not bleach. Dry in shade.";
let t = Date.now() - PRODUCTS.length * 3_600_000;
for (const p of PRODUCTS) {
  const id = newId();
  const slug = `${p.brand}-${p.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const sizes = p.sizes ?? SOCK;
  t += 3_600_000;
  await db.insert(schema.products).values({
    id, name: p.name, slug, categoryId: catIds.get(p.cat)!, brandId: brandIds.get(p.brand)!, status: SHOWN.has(p.cat) && !p.soon ? "active" : "archived",
    price: p.price * 100, compareAtPrice: p.mrp ? p.mrp * 100 : null,
    shortDescription: p.short,
    description: `${p.short}\n\nSample listing text. Replace it with the real details of this product from the seller admin.`,
    tags: p.tags ?? [], featured: p.featured ?? false, material: p.material, care: CARE,
    sizeGuide: sizes === MEN ? GUIDES.men : sizes === WOMEN ? GUIDES.women : sizes === HOODIE ? GUIDES.hoodie : sizes === BABY ? GUIDES.baby : sizes === KIDS ? GUIDES.kids : GUIDES.sock,
    deliveryMode: p.free ? "free" : "flat", deliveryCharge: p.free ? 0 : (p.charge ?? 49) * 100,
    codAllowed: p.cod ?? true, returnable: p.returnable ?? true, maxPerOrder: p.maxOrder ?? 10, maxPerCustomer: p.maxCustomer ?? null, forceOutOfStock: p.forceOut ?? false,
    comingSoon: Boolean(p.soon), launchNote: p.soon ?? null,
    hsnCode: CATEGORIES.find((c) => c.slug === p.cat)!.hsn, createdAt: t, updatedAt: t,
  });

  const photos = await productPhotos(p.name);
  if (photos.length) await db.insert(schema.productImages).values(photos.map((ph, i) => ({ id: newId(), productId: id, url: ph.url, alt: ph.alt, sortOrder: i })));

  let order = 0;
  for (const k of p.colors) {
    for (const size of sizes) {
      const stockEach = Math.max(0, Math.ceil((p.stock ?? 20) / (p.colors.length * sizes.length)));
      await db.insert(schema.variants).values({
        id: newId(), productId: id, sku: `${p.brand.slice(0, 3).toUpperCase()}-${slug.slice(0, 8).toUpperCase()}-${k.slice(0, 3).toUpperCase()}-${size.split(" ")[0].replace(/[^A-Za-z0-9]/g, "")}`,
        option1: size, option2: C[k].name, colorHex: C[k].hex, stock: stockEach, sortOrder: order++,
      });
    }
  }
}

const now = Date.now();
const DAY = 86_400_000;
await db.insert(schema.sales).values({
  id: newId(), name: "The Winter Sale", badge: "15% OFF", type: "percent", value: 15, scope: "category",
  targetIds: [catIds.get("mens-thermals")!],
  startsAt: now - DAY, endsAt: now + 6 * DAY, showBanner: true,
});
await db.insert(schema.cartOffers).values([
  { id: newId(), name: "Free delivery above ₹799", type: "free_shipping", value: 0, minSubtotal: 79900 },
  { id: newId(), name: "10% off above ₹1,999", type: "percent", value: 10, minSubtotal: 199900, maxDiscount: 30000 },
]);
await db.insert(schema.coupons).values([
  { id: newId(), code: "WELCOME10", description: "10% off your first order", type: "percent", value: 10, maxDiscount: 15000, firstOrderOnly: true, perCustomerLimit: 1 },
  { id: newId(), code: "INSTA50", description: "₹50 off orders above ₹499", type: "flat", value: 5000, minSubtotal: 49900 },
]);
console.log(`✓ Sample catalogue: ${BRANDS.length} brands, ${CATEGORIES.length} categories, ${PRODUCTS.length} listings`);
process.exit(0);
