"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { clientIp, createSession, destroySession, peekLimit, rateLimit, requireAdmin, requireOwner } from "@/lib/auth";
import { courierLink } from "@/lib/couriers";
import { alertNote, processStockAlerts } from "@/lib/inventory";
import { pingIndexNow } from "@/lib/indexnow";
import { previewMode } from "@/lib/preview";
import { retryNotification, notifyOrder } from "@/lib/notifications";
import { addEvent, changeOrderStatus } from "@/lib/orders";
import type { OrderStatus } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { refundPayment, razorpayConfigured } from "@/lib/razorpay";
import { getSettings, saveSettings, type StoreSettings } from "@/lib/settings";
import { parsePincodes } from "@/lib/delivery-area";
import { newId, slugify } from "@/lib/utils";

export type Result = { error?: string; ok?: boolean; id?: string; message?: string };
/** Field names as the seller sees them on the form, so errors read "Name is too short", not "name: Too small…". */
const FIELD: Record<string, string> = {
  name: "Name", price: "Selling price", compareAtPrice: "MRP", categoryId: "Category", variants: "Sizes & colours", option1: "Size", option2: "Colour",
  stock: "Stock", sku: "SKU", slug: "Link", code: "Coupon code", value: "Amount", minSubtotal: "Minimum order", startsAt: "Start time", endsAt: "End time",
  tagline: "Tagline", description: "Description", shortDescription: "Short description", deliveryCharge: "Delivery charge", images: "Photos", url: "Photo",
};
function friendly(i: z.ZodIssue) {
  const key = [...i.path].reverse().find((p) => typeof p === "string") as string | undefined;
  const row = i.path.find((p) => typeof p === "number");
  const label = key === "sizeHeights" ? "A size's height" : (key && FIELD[key]) ?? (key ? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()) : "A field");
  const where = typeof row === "number" && key !== "variants" ? ` (row ${row + 1})` : "";
  const msg = i.code === "too_small" ? (i.origin === "string" ? "is too short" : i.origin === "array" ? "needs at least one entry" : "is too low")
    : i.code === "too_big" ? (i.origin === "string" ? "is too long" : "is too high")
    : i.code === "invalid_type" ? "is missing or invalid" : i.message.charAt(0).toLowerCase() + i.message.slice(1);
  return `${label}${where} ${msg}.`;
}
const fail = (e: unknown): Result => ({ error: e instanceof z.ZodError ? [...new Set(e.issues.map(friendly))].join(" ") : (e as Error).message });

/* ---------- auth ---------- */
/**
 * Password-only login (the owner's choice): the password identifies the account. Because there's no
 * username to guess as well, wrong attempts are capped per device AND across the whole store.
 */
export async function adminLogin(password: string): Promise<Result> {
  if (previewMode()) return { error: "The seller admin is switched off on this preview." };
  if (typeof password !== "string" || !password || password.length > 200) return { error: "Enter your password." };
  const ip = await clientIp();
  if (!(await peekLimit(`admin:${ip}`, 10, 15 * 60_000)) || !(await peekLimit("admin-all", 30, 15 * 60_000))) return { error: "Too many attempts. Wait 15 minutes." };
  const team = await db.select().from(schema.admins).where(eq(schema.admins.active, true));
  team.sort((x, y) => Number(y.role === "owner") - Number(x.role === "owner"));
  let a: (typeof team)[number] | undefined;
  for (const t of team) if (await verifyPassword(password, t.passwordHash)) { a = t; break; }
  if (!a) {
    await rateLimit(`admin:${ip}`, 10, 15 * 60_000);
    await rateLimit("admin-all", 30, 15 * 60_000);
    return { error: "Wrong password." };
  }
  await createSession("admin", a.id);
  await db.update(schema.admins).set({ lastLoginAt: Date.now() }).where(eq(schema.admins.id, a.id));
  await audit({ id: a.id, name: a.name }, "login", "admin", a.id, "Logged in");
  return { ok: true };
}
export async function adminLogout() {
  await destroySession("admin");
  redirect("/admin/login");
}

/* ---------- categories ---------- */
const CategoryInput = z.object({
  id: z.string().optional(), name: z.string().trim().min(2).max(60), tagline: z.string().trim().max(120).optional().nullable(),
  image: z.string().max(500).optional().nullable(), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), sortOrder: z.number().int(), active: z.boolean(),
});
export async function saveCategory(input: unknown): Promise<Result> {
  const a = await requireAdmin();
  try {
    const d = CategoryInput.parse(input);
    if (d.id) {
      const [before] = await db.select().from(schema.categories).where(eq(schema.categories.id, d.id));
      await db.update(schema.categories).set({ name: d.name, tagline: d.tagline, image: d.image, accent: d.accent, sortOrder: d.sortOrder, active: d.active, updatedAt: Date.now() }).where(eq(schema.categories.id, d.id));
      await audit(a, "update", "category", d.id, `Updated category ${d.name}`, before, d);
    } else {
      const id = newId();
      let slug = slugify(d.name);
      const [dupe] = await db.select().from(schema.categories).where(eq(schema.categories.slug, slug));
      if (dupe) slug = `${slug}-${id.slice(0, 4).toLowerCase()}`;
      await db.insert(schema.categories).values({ id, slug, name: d.name, tagline: d.tagline, image: d.image, accent: d.accent, sortOrder: d.sortOrder, active: d.active });
      await audit(a, "create", "category", id, `Created category ${d.name}`, null, d);
    }
    revalidatePath("/admin/categories");
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function deleteCategory(id: string): Promise<Result> {
  const a = await requireAdmin();
  const [{ n, archived }] = await db.select({ n: sql<number>`sum(case when ${schema.products.status} != 'archived' then 1 else 0 end)`, archived: sql<number>`sum(case when ${schema.products.status} = 'archived' then 1 else 0 end)` })
    .from(schema.products).where(eq(schema.products.categoryId, id));
  if (Number(n) > 0) return { error: `Move its ${n} listing(s) to another category first, or hide the category instead.` };
  if (Number(archived) > 0) return { error: `${archived} archived listing(s) still belong to this category. Hide the category instead, so they keep working if you bring them back.` };
  const [before] = await db.select().from(schema.categories).where(eq(schema.categories.id, id));
  await db.delete(schema.categories).where(eq(schema.categories.id, id));
  await audit(a, "delete", "category", id, `Deleted category ${before?.name}`, before);
  revalidatePath("/admin/categories");
  return { ok: true };
}

/* ---------- brands ---------- */
const BrandInput = z.object({
  id: z.string().optional(), name: z.string().trim().min(1).max(60), tagline: z.string().trim().max(120).optional().nullable(),
  logo: z.string().max(500).optional().nullable(), image: z.string().max(500).optional().nullable(),
  isHouse: z.boolean(), sortOrder: z.number().int(), active: z.boolean(),
});
export async function saveBrand(input: unknown): Promise<Result> {
  const a = await requireAdmin();
  try {
    const d = BrandInput.parse(input);
    const values = { name: d.name, tagline: d.tagline || null, logo: d.logo || null, image: d.image || null, isHouse: d.isHouse, sortOrder: d.sortOrder, active: d.active };
    if (d.id) {
      const [before] = await db.select().from(schema.brands).where(eq(schema.brands.id, d.id));
      await db.update(schema.brands).set({ ...values, updatedAt: Date.now() }).where(eq(schema.brands.id, d.id));
      await audit(a, "update", "brand", d.id, `Updated brand ${d.name}`, before, d);
    } else {
      const id = newId();
      let slug = slugify(d.name);
      const [dupe] = await db.select().from(schema.brands).where(eq(schema.brands.slug, slug));
      if (dupe) slug = `${slug}-${id.slice(0, 4).toLowerCase()}`;
      await db.insert(schema.brands).values({ id, slug, ...values });
      await audit(a, "create", "brand", id, `Created brand ${d.name}`, null, d);
    }
    revalidatePath("/admin/brands");
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function deleteBrand(id: string): Promise<Result> {
  const a = await requireAdmin();
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.products).where(and(eq(schema.products.brandId, id), ne(schema.products.status, "archived")));
  if (Number(n) > 0) return { error: `Move its ${n} listing(s) to another brand first, or hide the brand instead.` };
  // Archived listings simply lose the brand (brand is optional), so nothing points at a deleted row.
  await db.update(schema.products).set({ brandId: null }).where(eq(schema.products.brandId, id));
  const [before] = await db.select().from(schema.brands).where(eq(schema.brands.id, id));
  await db.delete(schema.brands).where(eq(schema.brands.id, id));
  await audit(a, "delete", "brand", id, `Deleted brand ${before?.name}`, before);
  revalidatePath("/admin/brands");
  return { ok: true };
}

/* ---------- products ---------- */
const VariantInput = z.object({
  id: z.string().optional(), sku: z.string().trim().max(60).nullable().optional(), option1: z.string().trim().min(1).max(40), option2: z.string().trim().min(1).max(40),
  colorHex: z.string().max(9).nullable().optional(), price: z.number().int().positive().nullable().optional(), mrp: z.number().int().positive().nullable().optional(), minPrice: z.number().int().positive().nullable().optional(), stock: z.number().int().min(0), active: z.boolean().default(true),
});
const ProductInput = z.object({
  id: z.string().optional(), name: z.string().trim().min(2).max(120), slug: z.string().trim().max(90).optional(),
  shortDescription: z.string().trim().max(200).nullable().optional(), description: z.string().trim().max(5000).nullable().optional(),
  categoryId: z.string().min(1, "Choose a category"), brandId: z.string().nullable().optional(), status: z.enum(["draft", "active", "archived"]),
  price: z.number().int().positive("Enter a price"), compareAtPrice: z.number().int().positive().nullable().optional(),
  sizeChart: z.array(z.object({ title: z.string().max(60), columns: z.array(z.string().max(40)).min(1).max(8), rows: z.array(z.array(z.string().max(40)).max(8)).max(30) })).max(4).default([]),
  tags: z.array(z.string()).default([]), featured: z.boolean(), material: z.string().max(200).nullable().optional(), care: z.string().max(1000).nullable().optional(), sizeGuide: z.string().max(1000).nullable().optional(),
  sizeHeights: z.record(z.string().max(40), z.string().trim().max(20).regex(/^(\d{2,3}(\s*[-–]\s*\d{2,3})?)?$/, "Height should be in cm, like 104 or 104–116")).default({}),
  option1Label: z.string().trim().min(1).max(30), option2Label: z.string().trim().min(1).max(30),
  deliveryMode: z.enum(["free", "flat"]), deliveryCharge: z.number().int().min(0),
  codAllowed: z.boolean(), returnable: z.boolean(), forceOutOfStock: z.boolean(), showStockCount: z.boolean(),
  comingSoon: z.boolean().default(false), launchNote: z.string().trim().max(80).optional().nullable(),
  maxPerOrder: z.number().int().positive().nullable().optional(), maxPerCustomer: z.number().int().positive().nullable().optional(), lowStockThreshold: z.number().int().min(0),
  minPieces: z.number().int().min(1).max(20).default(1), comboFrom: z.number().int().min(2).max(50).nullable().optional(), comboAbove: z.number().int().positive().nullable().optional(),
  hsnCode: z.string().max(12).nullable().optional(), seoTitle: z.string().max(70).nullable().optional(), seoDescription: z.string().max(170).nullable().optional(),
  images: z.array(z.object({ url: z.string().max(500), alt: z.string().max(200).nullable().optional() })),
  variants: z.array(VariantInput).min(1, "Add at least one variant"),
});

export async function saveProduct(input: unknown): Promise<Result> {
  const a = await requireAdmin();
  try {
    const d = ProductInput.parse(input);
    if (d.status === "active" && !d.images.length) return { error: "Add at least one image before publishing." };
    const keys = d.variants.filter((v) => v.active).map((v) => `${v.option1}|${v.option2}`);
    if (new Set(keys).size !== keys.length) return { error: "Two variants have the same size and colour." };
    if (d.compareAtPrice && d.compareAtPrice < d.price) return { error: "MRP can't be lower than the selling price." };
    const highMin = d.variants.find((v) => v.active && v.minPrice && v.minPrice > (v.price ?? d.price));
    if (highMin) return { error: `The minimum price for ${[highMin.option1, highMin.option2].filter((x) => x !== "Free size" && x !== "Default").join(" · ") || "this item"} should be lower than its normal price.` };
    const lowMrp = d.variants.find((v) => v.active && v.mrp && v.mrp < (v.price ?? d.price));
    if (lowMrp) return { error: `The MRP for ${[lowMrp.option1, lowMrp.option2].filter((x) => x !== "Free size" && x !== "Default").join(" · ") || "this item"} can't be lower than its selling price.` };

    const id = d.id ?? newId();
    const before = d.id ? (await db.select().from(schema.products).where(eq(schema.products.id, d.id)))[0] : null;
    const beforeVariants = d.id ? await db.select().from(schema.variants).where(eq(schema.variants.productId, d.id)) : [];

    let slug = slugify(d.slug || (before?.slug ?? d.name));
    const [dupe] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, slug));
    if (dupe && dupe.id !== id) slug = `${slug}-${id.slice(0, 4).toLowerCase()}`;

    const values = {
      name: d.name, slug, shortDescription: d.shortDescription, description: d.description, categoryId: d.categoryId, brandId: d.brandId || null, status: d.status,
      price: d.price, compareAtPrice: d.compareAtPrice ?? null, sizeChart: d.sizeChart, tags: d.tags, featured: d.featured, material: d.material, care: d.care, sizeGuide: d.sizeGuide,
      sizeHeights: Object.fromEntries(Object.entries(d.sizeHeights).filter(([size, h]) => h && d.variants.some((v) => v.option1 === size)).map(([size, h]) => [size, h.replace(/\s*[-–]\s*/, "–")])),
      option1Label: d.option1Label, option2Label: d.option2Label, deliveryMode: d.deliveryMode, deliveryCharge: d.deliveryMode === "free" ? 0 : d.deliveryCharge,
      codAllowed: d.codAllowed, returnable: d.returnable, forceOutOfStock: d.forceOutOfStock, showStockCount: d.showStockCount,
      comingSoon: d.comingSoon, launchNote: d.comingSoon ? d.launchNote || null : null,
      maxPerOrder: d.maxPerOrder ?? null, maxPerCustomer: d.maxPerCustomer ?? null, lowStockThreshold: d.lowStockThreshold, minPieces: d.minPieces, comboFrom: null, comboAbove: d.comboAbove ?? null,
      hsnCode: d.hsnCode, seoTitle: d.seoTitle, seoDescription: d.seoDescription, updatedAt: Date.now(),
    };
    // Blank SKUs are filled in (brand-name-colour-size), so stock sheets and invoices always have one.
    const brandRow = d.brandId ? (await db.select({ name: schema.brands.name }).from(schema.brands).where(eq(schema.brands.id, d.brandId)))[0] : undefined;
    const code = (s: string, n: number) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, n);
    const usedSkus = new Set(d.variants.map((v) => v.sku).filter(Boolean));
    for (const v of d.variants) {
      if (v.sku) continue;
      const base = [code(brandRow?.name ?? "WV", 3), code(slug.replace(/-/g, ""), 8), v.option2 !== "Default" && code(v.option2, 3), v.option1 !== "Free size" && code(v.option1.split(" ")[0], 5)].filter(Boolean).join("-");
      let sku = base; let n = 2;
      while (usedSkus.has(sku)) sku = `${base}-${n++}`;
      usedSkus.add(sku); v.sku = sku;
    }
    await db.transaction(async (tx) => {
      if (before) await tx.update(schema.products).set(values).where(eq(schema.products.id, id));
      else await tx.insert(schema.products).values({ id, ...values });

      await tx.delete(schema.productImages).where(eq(schema.productImages.productId, id));
      if (d.images.length) await tx.insert(schema.productImages).values(d.images.map((im, i) => ({ id: newId(), productId: id, url: im.url, alt: im.alt ?? d.name, sortOrder: i })));

      const keep = new Set<string>();
      for (const [i, v] of d.variants.entries()) {
        const prev = v.id ? beforeVariants.find((b) => b.id === v.id) : undefined;
        const vId = prev?.id ?? newId();
        keep.add(vId);
        const row = { sku: v.sku || null, option1: v.option1, option2: v.option2, colorHex: v.colorHex || null, price: v.price ?? null, mrp: v.mrp ?? null, minPrice: v.minPrice ?? null, active: v.active, sortOrder: i };
        if (prev) {
          // Relative update: an order placed while this form was open can't be overwritten.
          const delta = v.stock - prev.stock;
          await tx.update(schema.variants).set({ ...row, stock: sql`max(${schema.variants.stock} + ${delta}, 0)` }).where(eq(schema.variants.id, vId));
          if (delta) await tx.insert(schema.stockMovements).values({ id: newId(), variantId: vId, productId: id, delta, reason: "manual_edit", actor: a.name });
        } else {
          await tx.insert(schema.variants).values({ id: vId, productId: id, ...row, stock: v.stock });
          if (v.stock) await tx.insert(schema.stockMovements).values({ id: newId(), variantId: vId, productId: id, delta: v.stock, reason: "initial_stock", actor: a.name });
        }
      }
      // Removed variants are retired, not deleted, so past orders stay intact.
      for (const b of beforeVariants) if (!keep.has(b.id)) await tx.update(schema.variants).set({ active: false }).where(eq(schema.variants.id, b.id));
    });
    await audit(a, before ? "update" : "create", "product", id, `${before ? "Updated" : "Created"} listing ${d.name}`, before ? { ...before, variants: beforeVariants } : null, d);
    // Switching off "Coming soon" is a launch: everyone who signed up hears about it once.
    const launched = Boolean(before?.comingSoon && !d.comingSoon);
    const notified = alertNote(await processStockAlerts(id, launched), launched);
    if (d.status === "active") await pingIndexNow([`/p/${slug}`, "/sitemap.xml"]);
    revalidatePath("/admin/products");
    return { ok: true, id, message: notified ? `Saved. ${notified}` : "Saved." };
  } catch (e) { return fail(e); }
}
export async function duplicateProduct(id: string): Promise<Result> {
  const a = await requireAdmin();
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!p) return { error: "Not found" };
  const newPid = newId();
  const imgs = await db.select().from(schema.productImages).where(eq(schema.productImages.productId, id));
  const vars = await db.select().from(schema.variants).where(eq(schema.variants.productId, id));
  await db.insert(schema.products).values({ ...p, id: newPid, name: `${p.name} (copy)`, slug: `${p.slug}-copy-${newPid.slice(0, 4).toLowerCase()}`, status: "draft", createdAt: Date.now(), updatedAt: Date.now() });
  if (imgs.length) await db.insert(schema.productImages).values(imgs.map((i) => ({ ...i, id: newId(), productId: newPid })));
  if (vars.length) await db.insert(schema.variants).values(vars.map((v) => ({ ...v, id: newId(), productId: newPid, stock: 0, sku: null })));
  await audit(a, "create", "product", newPid, `Duplicated ${p.name} as a draft`);
  revalidatePath("/admin/products");
  return { ok: true, id: newPid };
}
/** Publish, unpublish or archive several listings at once. Publishing skips listings with no photo. */
export async function bulkSetProductStatus(ids: string[], status: "draft" | "active" | "archived"): Promise<Result> {
  const a = await requireAdmin();
  if (!ids.length) return { error: "Select at least one listing." };
  if (!["draft", "active", "archived"].includes(status)) return { error: "Unknown status." };
  let ok = ids;
  if (status === "active") {
    const withImg = new Set((await db.select({ id: schema.productImages.productId }).from(schema.productImages).where(inArray(schema.productImages.productId, ids))).map((r) => r.id));
    ok = ids.filter((id) => withImg.has(id));
  }
  if (ok.length) await db.update(schema.products).set({ status, updatedAt: Date.now() }).where(inArray(schema.products.id, ok));
  await audit(a, "update", "product", ok.join(","), `Set ${ok.length} listing(s) to ${status}`, null, { ids: ok, status });
  if (status === "active") {
    for (const id of ok) await processStockAlerts(id);
    const slugs = await db.select({ slug: schema.products.slug }).from(schema.products).where(inArray(schema.products.id, ok));
    await pingIndexNow(slugs.map((x) => `/p/${x.slug}`));
  }
  revalidatePath("/admin/products");
  const skipped = ids.length - ok.length;
  const verb = status === "active" ? "Published" : status === "draft" ? "Unpublished" : "Archived";
  return { ok: true, message: `${verb} ${ok.length} listing${ok.length === 1 ? "" : "s"}.${skipped ? ` ${skipped} skipped: add a photo first.` : ""}` };
}
export async function setProductStatus(id: string, status: "draft" | "active" | "archived"): Promise<Result> {
  const a = await requireAdmin();
  if (!["draft", "active", "archived"].includes(status)) return { error: "Unknown status." };
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!p) return { error: "Not found" };
  if (status === "active") {
    const [img] = await db.select({ id: schema.productImages.id }).from(schema.productImages).where(eq(schema.productImages.productId, id)).limit(1);
    if (!img) return { error: "Add at least one photo before publishing." };
  }
  await db.update(schema.products).set({ status, updatedAt: Date.now() }).where(eq(schema.products.id, id));
  await audit(a, "status", "product", id, `${p.name}: ${p.status} → ${status}`, { status: p.status }, { status });
  const notified = status === "active" ? alertNote(await processStockAlerts(id)) : "";
  if (status === "active") await pingIndexNow([`/p/${p.slug}`]);
  revalidatePath("/admin/products");
  return { ok: true, message: notified ? `Published. ${notified}` : undefined };
}
export async function setForceOutOfStock(id: string, value: boolean): Promise<Result> {
  const a = await requireAdmin();
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!p) return { error: "Not found" };
  await db.update(schema.products).set({ forceOutOfStock: value, updatedAt: Date.now() }).where(eq(schema.products.id, id));
  await audit(a, "update", "product", id, `${p.name}: marked ${value ? "out of stock" : "back on sale"}`);
  const notified = value ? "" : alertNote(await processStockAlerts(id));
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
  return { ok: true, message: notified || undefined };
}
export async function bulkUpdateStock(changes: { variantId: string; stock: number }[]): Promise<Result> {
  const a = await requireAdmin();
  const ids = changes.map((c) => c.variantId);
  if (!ids.length) return { ok: true };
  const rows = await db.select().from(schema.variants).where(inArray(schema.variants.id, ids));
  const touched = new Set<string>();
  for (const c of changes) {
    const prev = rows.find((r) => r.id === c.variantId);
    if (!prev || !Number.isInteger(c.stock) || c.stock < 0 || c.stock === prev.stock) continue;
    const delta = c.stock - prev.stock;
    await db.update(schema.variants).set({ stock: sql`max(${schema.variants.stock} + ${delta}, 0)` }).where(eq(schema.variants.id, c.variantId));
    await db.insert(schema.stockMovements).values({ id: newId(), variantId: c.variantId, productId: prev.productId, delta, reason: "bulk_edit", actor: a.name });
    touched.add(prev.productId);
  }
  await audit(a, "update", "inventory", null, `Bulk stock edit: ${changes.length} variant(s)`, null, changes);
  const notified = { sent: 0, manual: 0 };
  for (const pid of touched) { const x = await processStockAlerts(pid); notified.sent += x.sent; notified.manual += x.manual; }
  revalidatePath("/admin/inventory");
  return { ok: true, message: `Stock saved. ${alertNote(notified)}`.trim() };
}

/* ---------- orders ---------- */
export async function updateShipment(orderId: string, input: { courier: string; awb: string; trackingUrl: string; markShipped: boolean }): Promise<Result> {
  const a = await requireAdmin();
  try {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (!o) return { error: "Order not found" };
    const courier = input.courier.trim() || null;
    const awb = input.awb.trim() || null;
    let trackingUrl = input.trackingUrl.trim() || courierLink(courier, awb);
    if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) return { error: "Tracking link must start with http:// or https://" };
    trackingUrl = trackingUrl || null;
    await db.update(schema.orders).set({ courier, awb, trackingUrl, updatedAt: Date.now() }).where(eq(schema.orders.id, orderId));
    const changed = o.awb !== awb || o.courier !== courier || o.trackingUrl !== trackingUrl;
    if (changed) {
      await addEvent(db, orderId, "shipment", `Shipment details saved: ${courier ?? "courier"} ${awb ?? ""}`.trim(), { actor: a.name, meta: { before: { courier: o.courier, awb: o.awb, trackingUrl: o.trackingUrl }, after: { courier, awb, trackingUrl } } });
      await audit(a, "shipment", "order", orderId, `${o.number}: AWB ${awb ?? "—"} (${courier ?? "no courier"})`, { courier: o.courier, awb: o.awb, trackingUrl: o.trackingUrl }, { courier, awb, trackingUrl });
    }
    if (input.markShipped && (o.status === "confirmed" || o.status === "packed")) {
      await changeOrderStatus(orderId, "shipped", { actor: a.name });
      await audit(a, "status", "order", orderId, `${o.number}: ${o.status} → shipped`);
    } else if (changed && ["shipped", "out_for_delivery"].includes(o.status)) {
      await notifyOrder(orderId, "tracking_updated");
    }
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function setOrderStatus(orderId: string, next: OrderStatus, opts: { note?: string; restock?: boolean } = {}): Promise<Result> {
  const a = await requireAdmin();
  try {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (!o) return { error: "Order not found" };
    // A booked Delhivery shipment is cancelled with the order, so no courier turns up for it.
    if (next === "cancelled" && o.courier === "Delhivery" && o.awb && ["confirmed", "packed"].includes(o.status)) {
      const { cancelDelhivery } = await import("@/lib/shipping");
      await cancelDelhivery(orderId, a.name).catch((e) => { throw new Error(`Couldn't cancel the Delhivery shipment first: ${(e as Error).message}`); });
    }
    await changeOrderStatus(orderId, next, { actor: a.name, note: opts.note, restock: opts.restock });
    await audit(a, "status", "order", orderId, `${o.number}: ${o.status} → ${next}`, { status: o.status }, { status: next, ...opts });
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function bulkSetStatus(orderIds: string[], next: OrderStatus): Promise<Result> {
  const a = await requireAdmin();
  const errors: string[] = [];
  let done = 0;
  for (const id of orderIds.slice(0, 100)) {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
    if (!o) continue;
    try {
      await changeOrderStatus(id, next, { actor: a.name });
      await audit(a, "status", "order", id, `${o.number}: ${o.status} → ${next} (bulk)`);
      done++;
    } catch (e) { errors.push(`${o.number}: ${(e as Error).message}`); }
  }
  revalidatePath("/admin/orders");
  return { ok: true, message: `${done} updated.${errors.length ? ` ${errors.length} skipped: ${errors[0]}` : ""}` };
}
export async function addOrderNote(orderId: string, note: string): Promise<Result> {
  const a = await requireAdmin();
  const clean = note.trim().slice(0, 1000);
  if (!clean) return { error: "Write a note first." };
  await addEvent(db, orderId, "note", clean, { actor: a.name });
  await audit(a, "note", "order", orderId, "Added an internal note");
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}
export async function refundOrder(orderId: string, amountPaise: number, reason: string): Promise<Result> {
  await requireAdmin();
  const a = await requireOwner().catch(() => null);
  if (!a) return { error: "Only the store owner can send refunds." };
  try {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (!o) return { error: "Order not found" };
    if (o.paymentStatus !== "paid" && o.paymentStatus !== "partially_refunded") return { error: "This order hasn't been paid." };
    const left = o.total - o.refundedTotal;
    if (!Number.isInteger(amountPaise) || amountPaise <= 0 || amountPaise > left) return { error: `Enter an amount up to ₹${left / 100}.` };
    // Claim the amount first so a double click can't refund twice.
    const claim = await db.update(schema.orders).set({ refundedTotal: o.refundedTotal + amountPaise, updatedAt: Date.now() })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.refundedTotal, o.refundedTotal)));
    if (!claim.rowsAffected) return { error: "Another refund just happened. Refresh and check." };
    let ref = "recorded manually";
    if (o.paymentMethod === "razorpay" && o.razorpayPaymentId && razorpayConfigured()) {
      try {
        ref = (await refundPayment(o.razorpayPaymentId, amountPaise, { order: o.number, reason: reason.slice(0, 200) })).id;
      } catch (e) {
        await db.update(schema.orders).set({ refundedTotal: o.refundedTotal }).where(eq(schema.orders.id, orderId));
        return { error: `Razorpay refused the refund: ${(e as Error).message}` };
      }
    }
    const total = o.refundedTotal + amountPaise;
    await db.update(schema.orders).set({ paymentStatus: total >= o.total ? "refunded" : "partially_refunded" }).where(eq(schema.orders.id, orderId));
    await addEvent(db, orderId, "refund", `Refunded ₹${amountPaise / 100} (${ref})${reason ? `: ${reason}` : ""}`, { actor: a.name });
    await audit(a, "refund", "order", orderId, `${o.number}: refunded ₹${amountPaise / 100}`, { refundedTotal: o.refundedTotal }, { refundedTotal: total, ref, reason });
    await notifyOrder(orderId, "order_refunded");
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true, message: ref === "recorded manually" ? "Refund recorded. No money was sent automatically; pay this one yourself." : "Refund sent through Razorpay." };
  } catch (e) { return fail(e); }
}
export async function resendNotification(id: string): Promise<Result> {
  const a = await requireAdmin();
  const status = await retryNotification(id);
  await audit(a, "resend", "notification", id, `Resent notification (${status})`);
  revalidatePath("/admin/notifications");
  return status === "sent" ? { ok: true, message: "Sent." } : status === "not_configured" ? { error: "This channel isn't connected yet. Add its keys first." } : { error: "Sending failed again. Check the error in the log." };
}

/* ---------- discounts ---------- */
const dt = z.number().int().nullable().optional();
const SaleInput = z.object({
  id: z.string().optional(), name: z.string().trim().min(2).max(60), badge: z.string().trim().max(20).nullable().optional(), type: z.enum(["percent", "flat", "min_price"]), value: z.number().int().positive(),
  scope: z.enum(["all", "category", "brand", "products"]), targetIds: z.array(z.string()), startsAt: z.number().int(), endsAt: z.number().int(), showBanner: z.boolean(), active: z.boolean(),
});
export async function saveSale(input: unknown): Promise<Result> {
  const a = await requireAdmin();
  try {
    const d = SaleInput.parse(input);
    if (d.endsAt <= d.startsAt) return { error: "End time must be after the start time." };
    if (d.type === "percent" && d.value > 90) return { error: "Percent sales can go up to 90%." };
    if (d.scope !== "all" && !d.targetIds.length) return { error: "Choose what this sale applies to." };
    if (d.type === "flat") {
      const p = schema.products;
      const scope = d.scope === "all" ? undefined : d.scope === "category" ? inArray(p.categoryId, d.targetIds) : d.scope === "brand" ? inArray(p.brandId, d.targetIds) : inArray(p.id, d.targetIds);
      const [cheap] = await db.select({ name: p.name, price: p.price }).from(p).where(and(eq(p.status, "active"), scope)).orderBy(p.price).limit(1);
      if (cheap && d.value >= cheap.price) return { error: `₹${d.value / 100} off is more than ${cheap.name} costs (₹${cheap.price / 100}). Use a smaller amount or a percent sale.` };
    }
    const id = d.id ?? newId();
    if (d.id) await db.update(schema.sales).set(d).where(eq(schema.sales.id, d.id));
    else await db.insert(schema.sales).values({ ...d, id });
    await audit(a, d.id ? "update" : "create", "sale", id, `${d.id ? "Updated" : "Created"} sale ${d.name}`, null, d);
    revalidatePath("/admin/discounts");
    return { ok: true };
  } catch (e) { return fail(e); }
}
const CouponInput = z.object({
  id: z.string().optional(), code: z.string().trim().min(3).max(24).regex(/^[A-Za-z0-9_-]+$/, "Letters and numbers only"), description: z.string().trim().max(120).nullable().optional(),
  type: z.enum(["percent", "flat", "free_shipping"]), value: z.number().int().min(0), minSubtotal: z.number().int().min(0), maxDiscount: z.number().int().positive().nullable().optional(),
  startsAt: dt, endsAt: dt, usageLimit: z.number().int().positive().nullable().optional(), perCustomerLimit: z.number().int().positive().nullable().optional(),
  firstOrderOnly: z.boolean(), excludeSaleItems: z.boolean(), active: z.boolean(),
});
export async function saveCoupon(input: unknown): Promise<Result> {
  const a = await requireAdmin();
  try {
    const d = CouponInput.parse(input);
    const row = { ...d, code: d.code.toUpperCase() };
    if (row.type === "percent" && (row.value < 1 || row.value > 100)) return { error: "Percent must be 1 to 100." };
    if (row.type === "flat" && row.value < 100) return { error: "Enter a discount amount." };
    if (row.startsAt && row.endsAt && row.endsAt <= row.startsAt) return { error: "End time must be after the start time." };
    if (row.type === "flat" && row.minSubtotal > 0 && row.value >= row.minSubtotal) return { error: `₹${row.value / 100} off on orders above ₹${row.minSubtotal / 100} gives the order away almost free. Check the amounts.` };
    const [dupe] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, row.code));
    if (dupe && dupe.id !== d.id) return { error: `A coupon named ${row.code} already exists.` };
    const id = d.id ?? newId();
    if (d.id) await db.update(schema.coupons).set(row).where(eq(schema.coupons.id, d.id));
    else await db.insert(schema.coupons).values({ ...row, id });
    await audit(a, d.id ? "update" : "create", "coupon", id, `${d.id ? "Updated" : "Created"} coupon ${row.code}`, null, row);
    revalidatePath("/admin/discounts");
    return { ok: true };
  } catch (e) { return fail(e); }
}
const OfferInput = z.object({
  id: z.string().optional(), name: z.string().trim().min(2).max(60), type: z.enum(["free_shipping", "percent", "flat"]), value: z.number().int().min(0), minSubtotal: z.number().int().min(0),
  maxDiscount: z.number().int().positive().nullable().optional(), combinesWithCoupons: z.boolean(), startsAt: dt, endsAt: dt, active: z.boolean(),
});
export async function saveOffer(input: unknown): Promise<Result> {
  const a = await requireAdmin();
  try {
    const d = OfferInput.parse(input);
    if (d.type === "percent" && (d.value < 1 || d.value > 90)) return { error: "Percent must be 1 to 90." };
    if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt) return { error: "End time must be after the start time." };
    if (d.type === "flat" && d.minSubtotal > 0 && d.value >= d.minSubtotal) return { error: `₹${d.value / 100} off on carts above ₹${d.minSubtotal / 100} gives the order away almost free. Check the amounts.` };
    const id = d.id ?? newId();
    if (d.id) await db.update(schema.cartOffers).set(d).where(eq(schema.cartOffers.id, d.id));
    else await db.insert(schema.cartOffers).values({ ...d, id });
    await audit(a, d.id ? "update" : "create", "cart_offer", id, `${d.id ? "Updated" : "Created"} cart offer ${d.name}`, null, d);
    revalidatePath("/admin/discounts");
    return { ok: true };
  } catch (e) { return fail(e); }
}
const LadderInput = z.object({
  by: z.enum(["value", "pieces"]).default("value"),
  steps: z.array(z.object({ min: z.number().int().positive(), percent: z.number().int().min(1).max(90) })).max(10),
  freeDeliveryMin: z.number().int().min(0).nullable(),
  combinesWithCoupons: z.boolean(),
});
/** One screen for the whole "buy more, save more" ladder: replaces every cart offer with these steps. */
export async function saveOfferLadder(input: unknown): Promise<Result> {
  const a = await requireAdmin();
  const parsed = LadderInput.safeParse(input);
  if (!parsed.success) return { error: "Each step needs an amount above 0 and a discount from 1% to 90%." };
  const d = parsed.data;
  const pieces = d.by === "pieces";
  const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
  const what = (n: number) => (pieces ? `${n} pieces` : inr(n));
  const steps = [...d.steps].sort((x, y) => x.min - y.min);
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].min === steps[i - 1].min) return { error: `Two steps start at ${what(steps[i].min)}. Give each step its own amount.` };
    if (steps[i].percent <= steps[i - 1].percent) return { error: `The ${what(steps[i].min)} step should give more than ${steps[i - 1].percent}%, or buyers gain nothing by adding more.` };
  }
  if (pieces && steps.some((s) => s.min < 2 || s.min > 50)) return { error: "Piece steps should be between 2 and 50 pieces." };
  const rows = [
    ...steps.map((st) => ({ id: newId(), name: pieces ? `Pick any ${st.min}, get ${st.percent}% off` : `${st.percent}% off above ${inr(st.min)}`, type: "percent" as const, value: st.percent, minSubtotal: pieces ? 0 : st.min, minPieces: pieces ? st.min : 0, maxDiscount: null, combinesWithCoupons: d.combinesWithCoupons, startsAt: null, endsAt: null, active: true })),
    ...(d.freeDeliveryMin != null ? [{ id: newId(), name: d.freeDeliveryMin ? `Free delivery above ${inr(d.freeDeliveryMin)}` : "Free delivery on every order", type: "free_shipping" as const, value: 0, minSubtotal: d.freeDeliveryMin, minPieces: 0, maxDiscount: null, combinesWithCoupons: true, startsAt: null, endsAt: null, active: true }] : []),
  ];
  const before = await db.select().from(schema.cartOffers);
  // One batch, so the store never sees a moment with no offers.
  if (rows.length) await db.batch([db.delete(schema.cartOffers), db.insert(schema.cartOffers).values(rows)]);
  else await db.delete(schema.cartOffers);
  await audit(a, "update", "cart_offer", null, `Saved discount ladder (${rows.length} offers)`, before, rows);
  revalidatePath("/", "layout");
  return { ok: true };
}
export async function markAlertMessaged(id: string): Promise<Result> {
  const a = await requireAdmin();
  await db.update(schema.stockAlerts).set({ status: "notified", notifiedAt: Date.now() }).where(and(eq(schema.stockAlerts.id, id), eq(schema.stockAlerts.status, "to_message")));
  await audit(a, "update", "stock_alert", id, "Messaged buyer about restock");
  revalidatePath("/admin");
  return { ok: true };
}
export async function deleteDiscount(kind: "sale" | "coupon" | "offer", id: string): Promise<Result> {
  const a = await requireAdmin();
  const table = kind === "sale" ? schema.sales : kind === "coupon" ? schema.coupons : schema.cartOffers;
  await db.delete(table).where(eq(table.id, id));
  await audit(a, "delete", kind, id, `Deleted ${kind}`);
  revalidatePath("/admin/discounts");
  return { ok: true };
}

/* ---------- reviews & customers ---------- */
export async function moderateReview(id: string, status: "approved" | "rejected"): Promise<Result> {
  const a = await requireAdmin();
  await db.update(schema.reviews).set({ status }).where(eq(schema.reviews.id, id));
  await audit(a, "moderate", "review", id, `Review ${status}`);
  revalidatePath("/admin/reviews");
  return { ok: true };
}
export async function setCustomerBlocked(id: string, blocked: boolean): Promise<Result> {
  const a = await requireAdmin();
  await db.update(schema.customers).set({ blocked }).where(eq(schema.customers.id, id));
  if (blocked) await db.delete(schema.sessions).where(and(eq(schema.sessions.subjectId, id), eq(schema.sessions.subjectType, "customer")));
  await audit(a, blocked ? "block" : "unblock", "customer", id, `${blocked ? "Blocked" : "Unblocked"} customer`);
  revalidatePath("/admin/customers");
  return { ok: true };
}

/* ---------- settings & team ---------- */
const money = z.number().int("Use whole paise").min(0, "Can't be negative").max(10_000_000);
const days = z.number().int().min(0).max(90);
const text = (max: number) => z.string().trim().max(max);
const url = z.union([z.literal(""), z.string().trim().url("Enter a full link starting with https://").max(300)]);
const email = z.union([z.literal(""), z.string().trim().email("Enter a valid email").max(200)]);
/** Every setting has a type and a sensible range, so a typo can't break checkout (e.g. a negative COD fee). */
const SettingsInput = z.object({
  storeName: text(60).min(2), tagline: text(200), announcement: text(160), supportEmail: email, whatsappNumber: text(20).regex(/^[+\d\s-]*$/, "Digits only"),
  instagramUrl: url, facebookUrl: url, legalName: text(120), grievanceOfficer: text(80), businessAddress: text(400), businessState: text(60),
  gstin: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "That doesn't look like a GSTIN (15 characters)")]),
  shippingCombine: z.enum(["highest", "sum"]), defaultDeliveryCharge: money, codEnabled: z.boolean(), codFee: money, codMaxOrder: money,
  dispatchDays: days, deliveryDaysMin: days, deliveryDaysMax: days, returnWindowDays: days,
  orderFeedbackEnabled: z.boolean(), deliveryFeedbackEnabled: z.boolean(), adminAlertEmail: email, dailySummary: z.boolean(), orderCopyEmail: email,
  whatsappGroupUrl: z.union([z.literal(""), z.string().trim().max(200).regex(/^https:\/\/(chat\.whatsapp\.com\/[A-Za-z0-9]+|(www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]+)\/?$/, "Paste the invite link from WhatsApp (it starts with https://chat.whatsapp.com/ or https://whatsapp.com/channel/)")]),
  supportHours: text(60), deliveryAreaName: text(40), winterLook: z.boolean(),
  delhiveryPickupName: text(100), delhiveryPickupPin: z.union([z.literal(""), z.string().trim().regex(/^[1-9]\d{5}$/, "Enter the 6-digit pincode of your pickup address")]),
  delhiveryPieceGrams: z.number().int().min(10, "Enter the weight of one piece in grams, like 250").max(5000),
  delhiveryBox: z.string().trim().regex(/^\d{1,3}\s*[x×]\s*\d{1,3}\s*[x×]\s*\d{1,3}$/i, "Enter the box size as length x width x height in cm, like 30x25x5"),
  deliveryPincodes: text(4000).superRefine((t, ctx) => {
    const { bad } = parsePincodes(t);
    if (bad.length) ctx.addIssue({ code: "custom", message: `these aren't pincodes, ranges or prefixes: ${bad.slice(0, 5).join(", ")}` });
  }),
}).partial(); // Unknown keys are dropped.

const SETTING_NAMES: Record<string, string> = { whatsappGroupUrl: "WhatsApp group link", deliveryPincodes: "Delivery pincodes", whatsappNumber: "WhatsApp number", supportEmail: "Support email", gstin: "GSTIN", adminAlertEmail: "Order alert email" };
export async function updateSettings(input: Partial<StoreSettings>): Promise<Result> {
  const a = await requireOwner().catch(() => null);
  if (!a) return { error: "Only the store owner can change settings." };
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${SETTING_NAMES[String(i.path[0])] ?? String(i.path[0] ?? "Setting")}: ${i.message}`).join("; ") };
  const values = parsed.data as Partial<StoreSettings>;
  const before = await getSettings();
  const min = values.deliveryDaysMin ?? before.deliveryDaysMin, max = values.deliveryDaysMax ?? before.deliveryDaysMax;
  if (min > max) return { error: "Fastest delivery days can't be more than the slowest." };
  await saveSettings(values);
  await audit(a, "update", "settings", null, "Updated store settings", before, values);
  revalidatePath("/", "layout");
  return { ok: true };
}
export async function changeOwnPassword(current: string, next: string): Promise<Result> {
  const a = await requireAdmin();
  if (next.length < 8) return { error: "Use at least 8 characters." };
  if (!(await verifyPassword(current, a.passwordHash))) return { error: "Current password is wrong." };
  for (const t of await db.select().from(schema.admins)) if (t.id !== a.id && (await verifyPassword(next, t.passwordHash))) return { error: "Choose a different password: someone on the team already uses this one." };
  await db.update(schema.admins).set({ passwordHash: await hashPassword(next) }).where(eq(schema.admins.id, a.id));
  // Sign out every other device, then start a fresh session here.
  await db.delete(schema.sessions).where(and(eq(schema.sessions.subjectId, a.id), eq(schema.sessions.subjectType, "admin")));
  await createSession("admin", a.id);
  await audit(a, "password", "admin", a.id, "Changed own password");
  return { ok: true, message: "Password changed. Other devices have been signed out." };
}
export async function addStaff(email: string, name: string, password: string): Promise<Result> {
  const a = await requireOwner().catch(() => null);
  if (!a) return { error: "Only the store owner can add staff." };
  const clean = email.trim().toLowerCase();
  if (!clean.includes("@") || password.length < 8 || !name.trim()) return { error: "Enter a name, an email and a password of at least 8 characters." };
  // Login is by password alone, so each person needs their own.
  for (const t of await db.select().from(schema.admins)) if (await verifyPassword(password, t.passwordHash)) return { error: "Choose a different password: someone on the team already uses this one." };
  const [dupe] = await db.select().from(schema.admins).where(eq(schema.admins.email, clean));
  if (dupe) return { error: "That email already has access." };
  const id = newId();
  await db.insert(schema.admins).values({ id, email: clean, name: name.trim(), passwordHash: await hashPassword(password), role: "staff" });
  await audit(a, "create", "admin", id, `Added staff ${clean}`);
  revalidatePath("/admin/settings");
  return { ok: true };
}
export async function setStaffActive(id: string, active: boolean): Promise<Result> {
  const a = await requireOwner().catch(() => null);
  if (!a) return { error: "Only the store owner can do this." };
  if (id === a.id) return { error: "You can't disable your own account." };
  await db.update(schema.admins).set({ active }).where(eq(schema.admins.id, id));
  if (!active) await db.delete(schema.sessions).where(and(eq(schema.sessions.subjectId, id), eq(schema.sessions.subjectType, "admin")));
  await audit(a, active ? "enable" : "disable", "admin", id, `${active ? "Enabled" : "Disabled"} staff access`);
  revalidatePath("/admin/settings");
  return { ok: true };
}

/* ---------- Delhivery ---------- */
export async function bookShipment(orderId: string, grams: number): Promise<Result & { awb?: string }> {
  const a = await requireAdmin();
  try {
    if (!(grams >= 50 && grams <= 30000)) return { error: "Enter the parcel weight in grams, like 500." };
    const { bookDelhivery } = await import("@/lib/shipping");
    const r = await bookDelhivery(orderId, Math.round(grams), a.name);
    await audit(a, "shipment", "order", orderId, `Booked Delhivery shipment ${r.awb}`, null, r);
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true, awb: r.awb };
  } catch (e) { return fail(e); }
}
export async function cancelShipmentAction(orderId: string): Promise<Result> {
  const a = await requireAdmin();
  try {
    const { cancelDelhivery } = await import("@/lib/shipping");
    await cancelDelhivery(orderId, a.name);
    await audit(a, "shipment", "order", orderId, "Cancelled Delhivery shipment");
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function shippingLabel(orderId: string): Promise<Result & { url?: string }> {
  await requireAdmin();
  try {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (!o?.awb) return { error: "Book the shipment first." };
    const { labelLink } = await import("@/lib/delhivery");
    return { ok: true, url: await labelLink(o.awb) };
  } catch (e) { return fail(e); }
}
export async function refreshTracking(): Promise<Result & { updated?: number }> {
  await requireAdmin();
  try {
    const { syncDelhivery } = await import("@/lib/shipping");
    const r = await syncDelhivery();
    revalidatePath("/admin/orders");
    return { ok: true, updated: r.updated };
  } catch (e) { return fail(e); }
}
/** Sends the morning summary email right now, so the owner can see what it looks like. */
export async function sendSummaryNow(): Promise<Result & { to?: string }> {
  await requireAdmin();
  const s = await getSettings();
  if (!s.adminAlertEmail) return { error: "Add your email in \"Email me when a new order comes in\" first, then save." };
  try {
    const { sendDailySummary } = await import("@/lib/daily-summary");
    await sendDailySummary(Date.now(), { force: true });
    return { ok: true, to: s.adminAlertEmail };
  } catch (e) { return fail(e); }
}
/** Fresh Delhivery wallet balance, in paise. */
export async function walletAction(): Promise<Result & { balance?: number }> {
  await requireAdmin();
  const { walletBalance } = await import("@/lib/delhivery-wallet");
  const w = await walletBalance({ fresh: true });
  return w ? { ok: true, balance: w.balance } : { error: "Couldn't read the Delhivery wallet right now." };
}
export async function bookPickup(input: { date: string; time: string; count: number }): Promise<Result & { pickupId?: string }> {
  const a = await requireAdmin();
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) return { error: "Choose a pickup date and time." };
    if (!(input.count >= 1 && input.count <= 500)) return { error: "Enter how many parcels are ready, from 1 to 500." };
    const s = await (await import("@/lib/settings")).getSettingsFresh();
    if (!s.delhiveryPickupName.trim()) return { error: "Add your Delhivery pickup address name in Settings first." };
    const { requestPickup } = await import("@/lib/delhivery");
    const pickupId = await requestPickup(s.delhiveryPickupName.trim(), input.date, input.time, Math.round(input.count));
    await audit(a, "pickup", "order", null, `Delhivery pickup ${pickupId} on ${input.date} ${input.time} for ${input.count} parcels`);
    return { ok: true, pickupId };
  } catch (e) { return fail(e); }
}

/* ---------- Returns ---------- */
export async function approveReturnAction(returnId: string, note: string): Promise<Result & { awb?: string | null }> {
  const a = await requireAdmin();
  try {
    const { approveReturn } = await import("@/lib/returns");
    const r = await approveReturn(returnId, typeof note === "string" ? note.slice(0, 300) : "", a.name);
    await audit(a, "return", "return", returnId, `Approved return${r.awb ? `, pickup ${r.awb}` : ""}`);
    revalidatePath("/admin/orders", "layout");
    return { ok: true, awb: r.awb };
  } catch (e) { return fail(e); }
}
export async function rejectReturnAction(returnId: string, reason: string): Promise<Result> {
  const a = await requireAdmin();
  try {
    const { rejectReturn } = await import("@/lib/returns");
    await rejectReturn(returnId, typeof reason === "string" ? reason : "", a.name);
    await audit(a, "return", "return", returnId, `Rejected return: ${reason}`);
    revalidatePath("/admin/orders", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function receiveReturnAction(returnId: string, restock: boolean): Promise<Result> {
  const a = await requireAdmin();
  try {
    const { receiveReturn } = await import("@/lib/returns");
    await receiveReturn(returnId, Boolean(restock), a.name);
    await audit(a, "return", "return", returnId, `Return received${restock ? ", restocked" : ""}`);
    revalidatePath("/admin/orders", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function refundReturnAction(orderId: string, amountPaise: number): Promise<Result> {
  const r = await refundOrder(orderId, amountPaise, "Return refund");
  if (!r.error) { const { completeReturn } = await import("@/lib/returns"); await completeReturn(orderId); }
  return r;
}
export async function bulkBookShipments(orderIds: string[]): Promise<Result & { booked?: number; failed?: string[] }> {
  const a = await requireAdmin();
  try {
    const { bookDelhivery, parcelGrams } = await import("@/lib/shipping");
    const s = await (await import("@/lib/settings")).getSettingsFresh();
    const orders = await db.select().from(schema.orders).where(inArray(schema.orders.id, orderIds.slice(0, 50)));
    let booked = 0; const failed: string[] = [];
    for (const o of orders) {
      if (o.awb || !["confirmed", "packed"].includes(o.status)) continue;
      const pcs = (await db.select({ q: schema.orderItems.qty }).from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id))).reduce((x, i) => x + i.q, 0);
      try { await bookDelhivery(o.id, parcelGrams(s, pcs), a.name); booked++; } catch (e) { failed.push(`${o.number}: ${(e as Error).message}`); }
    }
    revalidatePath("/admin/orders");
    return { ok: true, booked, failed, message: `${booked} booked with Delhivery.${failed.length ? ` ${failed.length} couldn't be booked.` : ""}` };
  } catch (e) { return fail(e); }
}
export async function bulkLabels(orderIds: string[]): Promise<Result & { labels?: { number: string; url: string }[] }> {
  await requireAdmin();
  try {
    const { labelLink } = await import("@/lib/delhivery");
    const orders = (await db.select().from(schema.orders).where(inArray(schema.orders.id, orderIds.slice(0, 50)))).filter((o) => o.awb && o.courier === "Delhivery");
    if (!orders.length) return { error: "None of these orders are booked with Delhivery yet." };
    const labels: { number: string; url: string }[] = [];
    for (const o of orders) { try { labels.push({ number: o.number, url: await labelLink(o.awb!) }); } catch { /* skipped */ } }
    return { ok: true, labels };
  } catch (e) { return fail(e); }
}
export async function setupPickupAction(input: { name: string; address: string; city: string; state: string; pin: string; phone: string; existing: boolean }): Promise<Result> {
  const a = await requireAdmin();
  try {
    const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    const w = { name: str(input.name, 60), address: str(input.address, 200), city: str(input.city, 60), state: str(input.state, 60), pin: str(input.pin, 6), phone: str(input.phone, 20) };
    if (w.name.length < 3) return { error: "Give the pickup address a name, like WonderVastra Warehouse." };
    if (!/^[1-9]\d{5}$/.test(w.pin)) return { error: "Enter the 6-digit pincode of your pickup address." };
    const { getSettingsFresh, saveSettings } = await import("@/lib/settings");
    const s = await getSettingsFresh();
    if (!input.existing) {
      if (w.address.length < 8 || w.city.length < 2 || w.state.length < 2) return { error: "Enter the full pickup address: house/shop, street, city and state." };
      if (w.phone.replace(/\D/g, "").length < 10) return { error: "Enter a 10-digit phone number for the courier." };
      const { registerPickup } = await import("@/lib/delhivery");
      await registerPickup({ ...w, email: s.supportEmail || s.adminAlertEmail || "support@wondervastra.in" });
    }
    await saveSettings({ delhiveryPickupName: w.name, delhiveryPickupPin: w.pin, ...(!s.businessAddress && w.address ? { businessAddress: `${w.address}, ${w.city}, ${w.state} ${w.pin}` } : {}) });
    await audit(a, "settings", "settings", null, `Delhivery pickup address set: ${w.name} (${w.pin})${input.existing ? "" : ", registered with Delhivery"}`);
    revalidatePath("/admin/orders", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function shipNowAction(orderId: string, grams: number): Promise<Result & { awb?: string; pickup?: string }> {
  const a = await requireAdmin();
  try {
    if (!(grams >= 50 && grams <= 30000)) return { error: "Enter the parcel weight in grams, like 500." };
    const { bookDelhivery } = await import("@/lib/shipping");
    const r = await bookDelhivery(orderId, Math.round(grams), a.name);
    // Book the courier visit too. One pickup per day collects every parcel, so an existing booking is fine.
    const dl = await import("@/lib/delhivery");
    const { getSettingsFresh } = await import("@/lib/settings");
    const s = await getSettingsFresh();
    const slot = dl.nextPickupSlot();
    const day = new Date(`${slot.date}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    const when = `${day} from ${slot.time === "14:00" ? "2 pm" : "11 am"}`;
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.orders).where(and(eq(schema.orders.courier, "Delhivery"), inArray(schema.orders.status, ["confirmed", "packed"])));
    let pickup = `Pickup booked for ${when}.`;
    try { await dl.requestPickup(s.delhiveryPickupName.trim(), slot.date, slot.time, Math.max(1, Number(n))); }
    catch (e) { pickup = /already booked/i.test((e as Error).message) ? `Pickup already booked for ${when}; this parcel goes with it.` : `Shipment booked, but the pickup wasn't: ${(e as Error).message} Use "Request a pickup" on the Orders page.`; }
    await db.update(schema.orders).set({ courierStatus: pickup.startsWith("Shipment booked") ? "Booked, waiting for pickup" : `Booked. ${pickup}` }).where(eq(schema.orders.id, orderId));
    const { addEvent } = await import("@/lib/orders");
    await addEvent(db, orderId, "shipment", pickup, { actor: a.name });
    await audit(a, "shipment", "order", orderId, `Shipped with Delhivery ${r.awb}. ${pickup}`);
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true, awb: r.awb, pickup };
  } catch (e) { return fail(e); }
}
