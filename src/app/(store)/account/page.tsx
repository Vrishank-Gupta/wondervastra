import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { and, desc, inArray, ne } from "drizzle-orm";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { formatDate, money, STATUS_LABEL } from "@/lib/format";
import { customerOrderFilter } from "@/lib/order-access";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };

export default async function AccountOrders() {
  const c = await requireCustomer();
  const orders = await db.select().from(schema.orders)
    .where(and(customerOrderFilter(c), ne(schema.orders.status, "pending_payment")))
    .orderBy(desc(schema.orders.createdAt)).limit(100);
  const items = orders.length ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orders.map((o) => o.id))) : [];
  if (!orders.length) return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <ShoppingBag size={40} aria-hidden />
      <p className="text-lg font-semibold">No orders yet</p>
      <Link href="/shop" className="btn btn-primary">Find your first pair</Link>
    </div>
  );
  return (
    <ul className="space-y-3">
      {orders.map((o) => {
        const its = items.filter((i) => i.orderId === o.id);
        return (
          <li key={o.id}>
            <Link href={`/order/${o.accessToken}`} className="card flex items-center gap-3 p-3 transition-all sm:p-4">
              <div className="flex -space-x-5">
                {its.slice(0, 3).map((i) => <span key={i.id} className="relative h-16 w-13 overflow-hidden rounded-sm border border-line bg-white">{i.image && <Image src={i.image} alt="" fill sizes="52px" className="object-cover" />}</span>)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{o.number} <span className="sticker ml-1 bg-sand-soft">{STATUS_LABEL[o.status]}</span></p>
                <p className="truncate text-sm text-ink-soft">{its.map((i) => i.name).join(", ")}</p>
                <p className="text-sm"><b>{money(o.total)}</b> · {formatDate(o.createdAt)}</p>
              </div>
              <ChevronRight aria-hidden className="shrink-0" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
