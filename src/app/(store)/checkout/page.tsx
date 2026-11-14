import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CheckoutClient } from "@/components/store/checkout-client";
import { getCustomer } from "@/lib/auth";
import { onlinePaymentsAvailable, razorpayConfigured, simulationAllowed } from "@/lib/razorpay";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const [customer, settings] = await Promise.all([getCustomer(), getSettings()]);
  const addresses = customer
    ? await db.select().from(schema.addresses).where(eq(schema.addresses.customerId, customer.id)).orderBy(desc(schema.addresses.isDefault), desc(schema.addresses.createdAt))
    : [];
  return (
    <CheckoutClient
      customer={customer ? { name: customer.name, email: customer.email, phone: customer.phone } : null}
      addresses={addresses.map((a) => ({ id: a.id, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, state: a.state, pincode: a.pincode }))}
      online={onlinePaymentsAvailable()}
      simulated={simulationAllowed()}
      live={razorpayConfigured()}
      codFee={settings.codFee}
    />
  );
}
