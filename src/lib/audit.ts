import { clearMemo } from "./memo";
import { clientIp } from "./auth";
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
  clearMemo(); // Every admin change is audited, so this keeps the storefront cache in step with it.
  let ip: string | null = null;
  try {
    ip = await clientIp();
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
