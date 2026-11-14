"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { clientIp, createSession, destroySession, rateLimit, requireAdmin, requireOwner } from "@/lib/auth";
import { courierLink } from "@/lib/couriers";
import { processStockAlerts } from "@/lib/inventory";
import { previewMode } from "@/lib/preview";
import { retryNotification, notifyOrder } from "@/lib/notifications";
import { addEvent, changeOrderStatus } from "@/lib/orders";
import type { OrderStatus } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { refundPayment, razorpayConfigured } from "@/lib/razorpay";
import { getSettings, saveSettings, type StoreSettings } from "@/lib/settings";
import { newId, slugify } from "@/lib/utils";

export type Result = { error?: string; ok?: boolean; id?: string; message?: string };
const fail = (e: unknown): Result => ({ error: e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message });

/* ---------- auth ---------- */
export async function adminLogin(email: string, password: string): Promise<Result> {
  if (previewMode()) return { error: "The seller admin is switched off on this preview." };
  const ip = await clientIp();
  if (!(await rateLimit(`admin:${ip}`, 10, 15 * 60_000))) return { error: "Too many attempts. Wait 15 minutes." };
  const [a] = await db.select().from(schema.admins).where(eq(schema.admins.email, email.trim().toLowerCase()));
  if (!a || !a.active || !(await verifyPassword(password, a.passwordHash))) return { error: "Wrong email or password." };
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
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.products).where(and(eq(schema.products.categoryId, id), ne(schema.products.status, "archived")));
  if (Number(n) > 0) return { error: `Move its ${n} listing(s) to another category first, or hide the category instead.` };
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
  const [before] = await db.select().from(schema.brands).where(eq(schema.brands.id, id));
  await db.delete(schema.brands).where(eq(schema.brands.id, id));
  await audit(a, "delete", "brand", id, `Deleted brand ${before?.name}`, before);
  revalidatePath("/admin/brands");
  return { ok: true };
}

/* ---------- products ---------- */
const VariantInput = z.object({
  id: z.string().optional(), sku: z.string().trim().max(60).nullable().optional(), option1: z.string().trim().min(1).max(40), option2: z.string().trim().min(1).max(40),
  colorHex: z.string().max(9).nullable().optional(), price: z.number().int().positive().nullable().optional(), stock: z.number().int().min(0), active: z.boolean().default(true),
});
const ProductInput = z.object({
  id: z.string().optional(), name: z.string().trim().min(2).max(120), slug: z.string().trim().max(90).optional(),
  shortDescription: z.string().trim().max(200).nullable().optional(), description: z.string().trim().max(5000).nullable().optional(),
  categoryId: z.string().min(1, "Choose a category"), brandId: z.string().nullable().optional(), status: z.enum(["draft", "active", "archived"]),
  price: z.number().int().positive("Enter a price"), compareAtPrice: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string()).default([]), featured: z.boolean(), material: z.string().max(200).nullable().optional(), care: z.string().max(1000).nullable().optional(), sizeGuide: z.string().max(1000).nullable().optional(),
  option1Label: z.string().trim().min(1).max(30), option2Label: z.string().trim().min(1).max(30),
  deliveryMode: z.enum(["free", "flat"]), deliveryCharge: z.number().int().min(0),
  codAllowed: z.boolean(), returnable: z.boolean(), forceOutOfStock: z.boolean(), showStockCount: z.boolean(),
  comingSoon: z.boolean().default(false), launchNote: z.string().trim().max(80).optional().nullable(),
  maxPerOrder: z.number().int().positive().nullable().optional(), maxPerCustomer: z.number().int().positive().nullable().optional(), lowStockThreshold: z.number().int().min(0),
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

    const id = d.id ?? newId();
    const before = d.id ? (await db.select().from(schema.products).where(eq(schema.products.id, d.id)))[0] : null;
    const beforeVariants = d.id ? await db.select().from(schema.variants).where(eq(schema.variants.productId, d.id)) : [];

    let slug = slugify(d.slug || (before?.slug ?? d.name));
    const [dupe] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, slug));
    if (dupe && dupe.id !== id) slug = `${slug}-${id.slice(0, 4).toLowerCase()}`;

    const values = {
      name: d.name, slug, shortDescription: d.shortDescription, description: d.description, categoryId: d.categoryId, brandId: d.brandId || null, status: d.status,
      price: d.price, compareAtPrice: d.compareAtPrice ?? null, tags: d.tags, featured: d.featured, material: d.material, care: d.care, sizeGuide: d.sizeGuide,
      option1Label: d.option1Label, option2Label: d.option2Label, deliveryMode: d.deliveryMode, deliveryCharge: d.deliveryMode === "free" ? 0 : d.deliveryCharge,
      codAllowed: d.codAllowed, returnable: d.returnable, forceOutOfStock: d.forceOutOfStock, showStockCount: d.showStockCount,
      comingSoon: d.comingSoon, launchNote: d.comingSoon ? d.launchNote || null : null,
      maxPerOrder: d.maxPerOrder ?? null, maxPerCustomer: d.maxPerCustomer ?? null, lowStockThreshold: d.lowStockThreshold,
      hsnCode: d.hsnCode, seoTitle: d.seoTitle, seoDescription: d.seoDescription, updatedAt: Date.now(),
    };
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
        const row = { sku: v.sku || null, option1: v.option1, option2: v.option2, colorHex: v.colorHex || null, price: v.price ?? null, active: v.active, sortOrder: i };
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
    const notified = await processStockAlerts(id, launched);
    revalidatePath("/admin/products");
    return { ok: true, id, message: notified ? `Saved. ${notified} waiting customer(s) notified it's ${launched ? "now available" : "back in stock"}.` : "Saved." };
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
export async function setProductStatus(id: string, status: "draft" | "active" | "archived"): Promise<Result> {
  const a = await requireAdmin();
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!p) return { error: "Not found" };
  await db.update(schema.products).set({ status, updatedAt: Date.now() }).where(eq(schema.products.id, id));
  await audit(a, "status", "product", id, `${p.name}: ${p.status} → ${status}`, { status: p.status }, { status });
  revalidatePath("/admin/products");
  return { ok: true };
}
export async function setForceOutOfStock(id: string, value: boolean): Promise<Result> {
  const a = await requireAdmin();
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!p) return { error: "Not found" };
  await db.update(schema.products).set({ forceOutOfStock: value, updatedAt: Date.now() }).where(eq(schema.products.id, id));
  await audit(a, "update", "product", id, `${p.name}: marked ${value ? "out of stock" : "back on sale"}`);
  const notified = value ? 0 : await processStockAlerts(id);
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
  return { ok: true, message: notified ? `${notified} waiting customer(s) notified.` : undefined };
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
  let notified = 0;
  for (const pid of touched) notified += await processStockAlerts(pid);
  revalidatePath("/admin/inventory");
  return { ok: true, message: `Stock saved.${notified ? ` ${notified} waiting customer(s) notified.` : ""}` };
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
  const a = await requireAdmin();
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
  id: z.string().optional(), name: z.string().trim().min(2).max(60), badge: z.string().trim().max(20).nullable().optional(), type: z.enum(["percent", "flat"]), value: z.number().int().positive(),
  scope: z.enum(["all", "category", "brand", "products"]), targetIds: z.array(z.string()), startsAt: z.number().int(), endsAt: z.number().int(), showBanner: z.boolean(), active: z.boolean(),
});
export async function saveSale(input: unknown): Promise<Result> {
  const a = await requireAdmin();
  try {
    const d = SaleInput.parse(input);
    if (d.endsAt <= d.startsAt) return { error: "End time must be after the start time." };
    if (d.type === "percent" && d.value > 90) return { error: "Percent sales can go up to 90%." };
    if (d.scope !== "all" && !d.targetIds.length) return { error: "Choose what this sale applies to." };
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
    const id = d.id ?? newId();
    if (d.id) await db.update(schema.cartOffers).set(d).where(eq(schema.cartOffers.id, d.id));
    else await db.insert(schema.cartOffers).values({ ...d, id });
    await audit(a, d.id ? "update" : "create", "cart_offer", id, `${d.id ? "Updated" : "Created"} cart offer ${d.name}`, null, d);
    revalidatePath("/admin/discounts");
    return { ok: true };
  } catch (e) { return fail(e); }
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
export async function updateSettings(values: Partial<StoreSettings>): Promise<Result> {
  const a = await requireOwner().catch(() => null);
  if (!a) return { error: "Only the store owner can change settings." };
  const before = await getSettings();
  await saveSettings(values);
  await audit(a, "update", "settings", null, "Updated store settings", before, values);
  revalidatePath("/", "layout");
  return { ok: true };
}
export async function changeOwnPassword(current: string, next: string): Promise<Result> {
  const a = await requireAdmin();
  if (next.length < 10) return { error: "Use at least 10 characters." };
  if (!(await verifyPassword(current, a.passwordHash))) return { error: "Current password is wrong." };
  await db.update(schema.admins).set({ passwordHash: await hashPassword(next) }).where(eq(schema.admins.id, a.id));
  await audit(a, "password", "admin", a.id, "Changed own password");
  return { ok: true, message: "Password changed." };
}
export async function addStaff(email: string, name: string, password: string): Promise<Result> {
  const a = await requireOwner().catch(() => null);
  if (!a) return { error: "Only the store owner can add staff." };
  const clean = email.trim().toLowerCase();
  if (!clean.includes("@") || password.length < 10 || !name.trim()) return { error: "Enter a name, an email and a password of at least 10 characters." };
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
