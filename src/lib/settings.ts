import { cache } from "react";
import { db, schema } from "@/db";

export const DEFAULT_SETTINGS = {
  storeName: "WonderVastra",
  tagline: "100% original brands at the lowest prices. Innerwear, thermals and our own label, delivered across India.",
  announcement: "",
  supportEmail: "",
  whatsappNumber: "",
  instagramUrl: "",
  facebookUrl: "",
  legalName: "",
  businessAddress: "",
  gstin: "",
  shippingCombine: "highest" as "highest" | "sum",
  defaultDeliveryCharge: 4900,
  codEnabled: true,
  codFee: 3000,
  codMaxOrder: 500000,
  dispatchDays: 2,
  deliveryDaysMin: 3,
  deliveryDaysMax: 7,
  returnWindowDays: 7,
  orderFeedbackEnabled: true,
  deliveryFeedbackEnabled: true,
  adminAlertEmail: "",
};
export type StoreSettings = typeof DEFAULT_SETTINGS;

export const getSettings = cache(async (): Promise<StoreSettings> => {
  const rows = await db.select().from(schema.settings);
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as StoreSettings;
});
export async function saveSettings(values: Partial<StoreSettings>) {
  for (const [key, value] of Object.entries(values)) {
    await db
      .insert(schema.settings)
      .values({ key, value: value as unknown as object, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: value as unknown as object, updatedAt: Date.now() } });
  }
}
