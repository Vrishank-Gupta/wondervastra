import { headers } from "next/headers";
import { db, schema } from "@/db";
import { newId } from "./utils";

type Actor = { id: string; name: string } | null;

export async function audit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
  before?: unknown,
  after?: unknown,
) {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  } catch {
    /* outside a request */
  }
  await db.insert(schema.auditLogs).values({
    id: newId(),
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? "system",
    action,
    entity,
    entityId,
    summary,
    before: before ?? null,
    after: after ?? null,
    ip,
  });
}
