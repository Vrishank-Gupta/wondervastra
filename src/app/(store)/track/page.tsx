import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { PackageSearch } from "lucide-react";
import { db, schema } from "@/db";
import { clientIp, rateLimit } from "@/lib/auth";
import { normalizeEmail, normalizePhone } from "@/lib/utils";

export const metadata: Metadata = { title: "Track your order" };

async function lookup(formData: FormData) {
  "use server";
  const number = String(formData.get("number") ?? "").trim().toUpperCase();
  const contact = String(formData.get("contact") ?? "");
  const ip = await clientIp();
  if (!(await rateLimit(`track:${ip}`, 15, 15 * 60_000))) redirect("/track?e=limit");
  const phone = normalizePhone(contact);
  const email = normalizeEmail(contact);
  const match = phone ? eq(schema.orders.phone, phone) : email ? eq(schema.orders.email, email) : null;
  if (!match) redirect("/track?e=notfound");
  const [o] = await db.select({ token: schema.orders.accessToken }).from(schema.orders).where(and(eq(schema.orders.number, number), match));
  if (!o) redirect("/track?e=notfound");
  redirect(`/order/${o.token}`);
}

export default async function Track({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <div className="container-x flex justify-center py-12">
      <form action={lookup} className="card-pop w-full max-w-md space-y-4 p-6">
        <PackageSearch size={36} aria-hidden />
        <h1 className="text-3xl">Where&apos;s my order?</h1>
        <p className="text-sm text-ink-soft">No login needed. Use the order number from your WhatsApp or email.</p>
        {e === "notfound" && <p className="rounded-sm border border-clay bg-clay-soft p-3 text-sm font-medium" role="alert">We couldn&apos;t find that order. Please check both details.</p>}
        {e === "limit" && <p className="rounded-sm border border-clay bg-clay-soft p-3 text-sm font-medium" role="alert">Too many attempts. Please try again in a few minutes.</p>}
        <div><label className="label" htmlFor="number">Order number</label><input id="number" name="number" className="input uppercase" required placeholder="VVXXXXXXX" /></div>
        <div><label className="label" htmlFor="contact">Phone or email used for the order</label><input id="contact" name="contact" className="input" required /></div>
        <button className="btn btn-primary w-full">Track order</button>
      </form>
    </div>
  );
}
