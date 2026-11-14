import { NextResponse } from "next/server";
import { getAllCards } from "@/lib/catalog";

export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").slice(0, 12);
  const cards = await getAllCards();
  return NextResponse.json(ids.flatMap((id) => cards.filter((c) => c.id === id)));
}
