import { NextResponse } from "next/server";
import { areaLabel, deliversTo, ncrPlace } from "@/lib/delivery-area";
import { getSettings } from "@/lib/settings";

/**
 * Does the store deliver to this pincode, and which city/state is it? The delivery answer comes from the
 * store's own pincode list, so it never depends on the India Post lookup, which only fills city and state.
 */
export async function GET(_: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  if (!/^[1-9]\d{5}$/.test(pin)) return NextResponse.json({ error: "Enter a valid 6-digit pincode." }, { status: 400 });
  const s = await getSettings();
  const serviceable = deliversTo(pin, s.deliveryPincodes);
  let city: string | null = null, state: string | null = null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(3000), next: { revalidate: 86400 } });
    const po = (await res.json())?.[0]?.PostOffice?.[0];
    if (po) { city = po.District; state = po.State; }
  } catch { /* lookup is a convenience */ }
  return NextResponse.json({
    pincode: pin, serviceable, area: areaLabel(s),
    // "Noida" reads better than the district name "Gautam Buddha Nagar"; Delhi keeps its finer district ("South Delhi").
    place: (ncrPlace(pin) !== "Delhi" && ncrPlace(pin)) || city || ncrPlace(pin), city, state,
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
