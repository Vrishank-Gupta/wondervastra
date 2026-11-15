import { cache } from "react";
import { db, schema } from "@/db";
import { NCR_PINCODES } from "./delivery-area";
import { clearMemo, memo } from "./memo";

export const DEFAULT_SETTINGS = {
  storeName: "WonderVastra",
  tagline: "100% original brands at the lowest prices. Thermals for kids, babies and men.",
  announcement: "",
  supportEmail: "",
  whatsappNumber: "",
  /** Invite link to the store's WhatsApp group or channel (chat.whatsapp.com/… or whatsapp.com/channel/…). */
  whatsappGroupUrl: "",
  supportHours: "Mon–Sat, 10am–7pm",
  /** Delivery area. Blank pincode list = all of India. */
  deliveryAreaName: "Delhi NCR",
  deliveryPincodes: NCR_PINCODES,
  instagramUrl: "",
  facebookUrl: "",
  legalName: "",
  businessAddress: "",
  /** State the business is registered in; decides CGST+SGST vs IGST on invoices. */
  businessState: "",
  gstin: "",
  shippingCombine: "highest" as "highest" | "sum",
  defaultDeliveryCharge: 4900,
  codEnabled: true,
  codFee: 3000,
  codMaxOrder: 500000,
  dispatchDays: 2,
  deliveryDaysMin: 3,
  deliveryDaysMax: 7,
  returnWindowDays: 3,
  orderFeedbackEnabled: true,
  deliveryFeedbackEnabled: true,
  adminAlertEmail: "",
  /** Delhivery: the pickup address name exactly as saved in Delhivery One, its pincode, and parcel defaults. */
  /** Seasonal look: light snowfall on the home banner and snowflakes in the top banner. */
  winterLook: true,
  delhiveryPickupName: "",
  delhiveryPickupPin: "",
  delhiveryPieceGrams: 250,
  delhiveryBox: "30x25x5",
};
export type StoreSettings = typeof DEFAULT_SETTINGS;

export const getSettings = cache(async (): Promise<StoreSettings> => {
  const rows = await memo("settings", () => db.select().from(schema.settings));
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as StoreSettings;
});
/** Always reads the database: for the admin settings page, right after a save. */
export async function getSettingsFresh(): Promise<StoreSettings> {
  const rows = await db.select().from(schema.settings);
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) } as StoreSettings;
}
export async function saveSettings(values: Partial<StoreSettings>) {
  clearMemo();
  for (const [key, value] of Object.entries(values)) {
    await db
      .insert(schema.settings)
      .values({ key, value: value as unknown as object, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: value as unknown as object, updatedAt: Date.now() } });
  }
}
