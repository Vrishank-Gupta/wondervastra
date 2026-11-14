import { NextResponse } from "next/server";

/** Best-effort city/state lookup from the public India Post API. Failure is fine: the form still works. */
export async function GET(_: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  if (!/^[1-9]\d{5}$/.test(pin)) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(3000), next: { revalidate: 86400 } });
    const json = await res.json();
    const po = json?.[0]?.PostOffice?.[0];
    if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ city: po.District, state: po.State });
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
