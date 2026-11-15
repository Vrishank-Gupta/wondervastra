import { NextResponse } from "next/server";
import { expireUnpaidOrders } from "@/lib/orders";
import { syncDelhivery } from "@/lib/shipping";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expiredOrders = await expireUnpaidOrders();
  const tracking = await syncDelhivery().catch((e) => ({ error: String(e?.message ?? e) }));
  return NextResponse.json({ expiredOrders, tracking });
}
