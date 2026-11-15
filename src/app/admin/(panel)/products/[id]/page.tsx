import type { Metadata } from "next";
import Link from "next/link";
import { RestockMessages } from "@/components/admin/restock-messages";
import { restocksToMessage } from "@/lib/inventory";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProductForm } from "@/components/admin/product-form";
import { PageHead, Panel } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Edit listing" };
const str = (n: number | null | undefined, div = 1) => (n == null ? "" : String(n / div));

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!p) notFound();
  const [cats, brands, imgs, vars, moves, alerts] = await Promise.all([
    db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)),
    db.select().from(schema.brands).orderBy(asc(schema.brands.sortOrder), asc(schema.brands.name)),
    db.select().from(schema.productImages).where(eq(schema.productImages.productId, id)).orderBy(asc(schema.productImages.sortOrder)),
    db.select().from(schema.variants).where(eq(schema.variants.productId, id)).orderBy(asc(schema.variants.sortOrder)),
    db.select().from(schema.stockMovements).where(eq(schema.stockMovements.productId, id)).orderBy(desc(schema.stockMovements.createdAt)).limit(20),
    db.select().from(schema.stockAlerts).where(and(eq(schema.stockAlerts.productId, id), eq(schema.stockAlerts.status, "waiting"))),
  ]);
  const toMessage = await restocksToMessage(id);
  return (
    <>
      <PageHead title={p.name} sub={`Last updated ${formatDateTime(p.updatedAt)}`} actions={<Link className="btn btn-white btn-sm" href={`/p/${p.slug}`} target="_blank">View on store</Link>} />
      <ProductForm categories={cats.filter((c) => c.active || c.id === p.categoryId).map((c) => ({ id: c.id, name: c.name }))} brands={brands.filter((b) => b.active || b.id === p.brandId).map((b) => ({ id: b.id, name: b.name, isHouse: b.isHouse }))} initial={{
        id: p.id, name: p.name, slug: p.slug, shortDescription: p.shortDescription ?? "", description: p.description ?? "", categoryId: p.categoryId, brandId: p.brandId ?? "", status: p.status,
        price: str(p.price, 100), compareAtPrice: str(p.compareAtPrice, 100), tags: p.tags.join(", "), featured: p.featured, material: p.material ?? "", care: p.care ?? "", sizeGuide: p.sizeGuide ?? "",
        option1Label: p.option1Label, option2Label: p.option2Label, deliveryMode: p.deliveryMode, deliveryCharge: str(p.deliveryCharge, 100), codAllowed: p.codAllowed, returnable: p.returnable,
        forceOutOfStock: p.forceOutOfStock, comingSoon: p.comingSoon, launchNote: p.launchNote ?? "", showStockCount: p.showStockCount, maxPerOrder: str(p.maxPerOrder), maxPerCustomer: str(p.maxPerCustomer), lowStockThreshold: String(p.lowStockThreshold),
        hsnCode: p.hsnCode ?? "", seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "", sizeHeights: p.sizeHeights ?? {},
        images: imgs.map((i) => ({ url: i.url, alt: i.alt ?? p.name })),
        variants: vars.filter((v) => v.active).map((v) => ({ id: v.id, sku: v.sku ?? "", option1: v.option1, option2: v.option2, colorHex: v.colorHex ?? "", price: str(v.price, 100), mrp: str(v.mrp, 100), stock: String(v.stock), active: v.active })),
      }} />
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 [&>*]:min-w-0">
        <Panel title={`Waiting for restock (${alerts.length})`}>
          {alerts.length ? <ul className="space-y-1 text-sm">{alerts.map((a) => { const v = vars.find((x) => x.id === a.variantId); return <li key={a.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{a.email ?? a.phone}{v ? <span className="text-ink-soft"> · {[v.option1, v.option2].filter((x) => x && x !== "Default" && x !== "Free size").join(", ")}</span> : null}</span><span className="shrink-0 text-xs text-ink-soft">{formatDateTime(a.createdAt)}</span></li>; })}</ul> : <p className="text-sm text-ink-soft">Nobody yet. They&apos;re messaged automatically when stock returns.</p>}
          {toMessage.length > 0 && <div className="mt-3 border-t border-line pt-2"><p className="text-sm font-semibold">Back in stock, message by hand:</p><RestockMessages rows={toMessage} /></div>}
        </Panel>
        <Panel title="Stock history">
          {moves.length ? (
            <ul className="space-y-1 text-sm">{moves.map((m) => {
              const v = vars.find((x) => x.id === m.variantId);
              return <li key={m.id} className="flex justify-between gap-2"><span className="min-w-0 truncate"><b className={m.delta > 0 ? "text-pine" : "text-clay"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</b> {v?.option2} {v?.option1} · {m.reason.replace(/_/g, " ")} · {m.actor}</span><span className="shrink-0 text-xs text-ink-soft">{formatDateTime(m.createdAt)}</span></li>;
            })}</ul>
          ) : <p className="text-sm text-ink-soft">No changes yet.</p>}
        </Panel>
      </div>
    </>
  );
}
