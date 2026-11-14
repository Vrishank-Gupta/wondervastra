import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { and, asc, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db, schema } from "@/db";
import { ProductRowActions } from "@/components/admin/product-row-actions";
import { ListingBulkBar } from "@/components/admin/listing-bulk";
import { Empty, PageHead, Tbl } from "@/components/admin/ui";
import { money } from "@/lib/format";
import { siteUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Listings" };

export default async function Products({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const p = schema.products;
  const conds: SQL[] = [];
  // Archived listings stay out of the way unless asked for.
  if (sp.status && sp.status !== "all") conds.push(eq(p.status, sp.status as "draft"));
  else if (!sp.status) conds.push(ne(p.status, "archived"));
  if (sp.category) conds.push(eq(p.categoryId, sp.category));
  if (sp.brand) conds.push(eq(p.brandId, sp.brand));
  if (sp.q) conds.push(sql`lower(${p.name}) LIKE ${`%${sp.q.toLowerCase()}%`}`);
  const [rows, cats, brands, stock, imgs, alerts] = await Promise.all([
    db.select().from(p).where(conds.length ? and(...conds) : undefined).orderBy(desc(p.updatedAt)).limit(300),
    db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)),
    db.select().from(schema.brands).orderBy(asc(schema.brands.sortOrder), asc(schema.brands.name)),
    db.select({ id: schema.variants.productId, n: sql<number>`sum(case when ${schema.variants.active} then ${schema.variants.stock} else 0 end)` }).from(schema.variants).groupBy(schema.variants.productId),
    db.select({ id: schema.productImages.productId, url: schema.productImages.url, s: schema.productImages.sortOrder }).from(schema.productImages).orderBy(asc(schema.productImages.sortOrder)),
    db.select({ id: schema.stockAlerts.productId, n: sql<number>`count(*)` }).from(schema.stockAlerts).where(eq(schema.stockAlerts.status, "waiting")).groupBy(schema.stockAlerts.productId),
  ]);
  const drafts = rows.filter((r) => r.status === "draft").length;
  return (
    <>
      <PageHead title="Listings" sub={`${rows.length} shown`} actions={<Link className="btn btn-primary btn-sm" href="/admin/products/new"><Plus size={15} aria-hidden /> Add listing</Link>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input aria-label="Search listings" name="q" defaultValue={sp.q} className="input min-w-44 flex-1 py-1.5" placeholder="Search by name" />
        <select aria-label="Category" name="category" defaultValue={sp.category} className="input w-auto py-1.5"><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select aria-label="Brand" name="brand" defaultValue={sp.brand} className="input w-auto py-1.5"><option value="">All brands</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select aria-label="Status" name="status" defaultValue={sp.status ?? ""} className="input w-auto py-1.5"><option value="">Live & drafts</option><option value="active">Live</option><option value="draft">Draft</option><option value="archived">Archived</option><option value="all">Everything</option></select>
        <button className="btn btn-ink btn-sm">Filter</button>
      </form>
      {drafts > 0 && sp.status !== "draft" && (
        <p className="mb-3 rounded-sm border border-gold/40 bg-gold-soft p-3 text-sm">
          <b>{drafts} draft{drafts === 1 ? "" : "s"} not in your store yet.</b> Open each one, check the photos, price and stock, then publish. Or tick several below and use <b>Publish selected</b>.{" "}
          <Link className="font-medium underline underline-offset-4" href="/admin/products?status=draft">Show drafts only</Link>
        </p>
      )}
      {rows.length ? (
        <>
        <ListingBulkBar />
        <Tbl>
          <thead><tr><th className="w-8"><span className="sr-only">Select</span></th><th>Listing</th><th>Status</th><th className="text-right">Price</th><th className="text-right">Stock</th><th>Delivery</th><th>Limit</th><th>Share & manage</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const n = Number(stock.find((s) => s.id === r.id)?.n ?? 0);
              const img = imgs.find((i) => i.id === r.id)?.url;
              const waiting = Number(alerts.find((a) => a.id === r.id)?.n ?? 0);
              const sample = imgs.some((i) => i.id === r.id && i.url.startsWith("/seed/"));
              const flags = [!img && "No photo", sample && "Sample photos", n === 0 && !r.forceOutOfStock && !r.comingSoon && "No stock"].filter(Boolean) as string[];
              return (
                <tr key={r.id} className="hover:bg-ivory">
                  <td><input type="checkbox" form="bulk" name="ids" value={r.id} className="size-4 accent-ink" aria-label={`Select ${r.name}`} /></td>
                  <td className="min-w-56">
                    <Link href={`/admin/products/${r.id}`} className="flex items-center gap-2.5">
                      <span className="relative h-12 w-10 shrink-0 overflow-hidden rounded border border-line bg-ivory">{img && <Image src={img} alt="" fill sizes="40px" className="object-cover" />}</span>
                      <span><b className="hover:underline">{r.name}</b><span className="block text-xs text-ink-soft">{[brands.find((b) => b.id === r.brandId)?.name, cats.find((c) => c.id === r.categoryId)?.name].filter(Boolean).join(" · ")}</span>
                        {flags.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{flags.map((fl) => <span key={fl} className="rounded-full bg-clay-soft px-1.5 py-0.5 text-[10px] font-medium text-clay">{fl}</span>)}</span>}</span>
                    </Link>
                  </td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "active" ? "bg-pine-soft" : r.status === "draft" ? "bg-sand-soft" : "bg-line"}`}>{r.status === "active" ? "Live" : r.status === "draft" ? "Draft" : "Archived"}</span>{r.comingSoon && r.status === "active" && <span className="mt-1 block text-xs text-slate">Coming soon</span>}</td>
                  <td className="text-right whitespace-nowrap"><b>{money(r.price)}</b>{r.compareAtPrice && <s className="block text-xs text-ink-soft">{money(r.compareAtPrice)}</s>}</td>
                  <td className="text-right whitespace-nowrap">{r.forceOutOfStock ? <span className="text-xs font-medium text-clay">Marked out</span> : <b className={n === 0 ? "text-clay" : n <= r.lowStockThreshold ? "text-[#a26a00]" : ""}>{n}</b>}{waiting > 0 && <span className="block text-xs text-slate">{waiting} waiting</span>}</td>
                  <td className="text-xs whitespace-nowrap">{r.deliveryMode === "free" ? "Free" : money(r.deliveryCharge)}</td>
                  <td className="text-xs whitespace-nowrap">{r.maxPerOrder ? `${r.maxPerOrder}/order` : "—"}{r.maxPerCustomer ? `, ${r.maxPerCustomer}/buyer` : ""}</td>
                  <td><ProductRowActions id={r.id} slug={r.slug} name={r.name} status={r.status} forceOut={r.forceOutOfStock} base={siteUrl()} /></td>
                </tr>
              );
            })}
          </tbody>
        </Tbl>
        </>
      ) : <Empty>No listings found. <Link className="font-medium underline" href="/admin/products/new">Add your first listing</Link></Empty>}
    </>
  );
}
