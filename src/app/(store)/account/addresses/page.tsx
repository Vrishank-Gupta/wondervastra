import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { AddressManager } from "./manager";

export const metadata: Metadata = { title: "Addresses", robots: { index: false } };

export default async function Addresses() {
  const c = await requireCustomer("/account/addresses");
  const rows = await db.select().from(schema.addresses).where(eq(schema.addresses.customerId, c.id)).orderBy(desc(schema.addresses.isDefault));
  return <AddressManager addresses={rows.map((a) => ({ id: a.id, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault }))} />;
}
