import { NextResponse } from "next/server";
import { expireUnpaidOrders } from "@/lib/orders";
import { syncDelhivery } from "@/lib/shipping";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (new URL(req.url).searchParams.get("job") === "daily") {
    const { sendDailySummary } = await import("@/lib/daily-summary");
    return NextResponse.json(await sendDailySummary());
  }
  const expiredOrders = await expireUnpaidOrders();
  const tracking = await syncDelhivery().catch((e) => ({ error: String(e?.message ?? e) }));
  // Visitor data is kept for 90 days.
  const { db, schema } = await import("@/db");
  const { lt } = await import("drizzle-orm");
  const cutoff = Date.now() - 90 * 86_400_000;
  await db.delete(schema.pageViews).where(lt(schema.pageViews.createdAt, cutoff)).catch(() => {});
  await db.delete(schema.siteEvents).where(lt(schema.siteEvents.createdAt, cutoff)).catch(() => {});
  return NextResponse.json({ expiredOrders, tracking });
}
