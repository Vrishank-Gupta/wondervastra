import { NextResponse } from "next/server";
import { expireUnpaidOrders } from "@/lib/orders";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ expiredOrders: await expireUnpaidOrders() });
}
