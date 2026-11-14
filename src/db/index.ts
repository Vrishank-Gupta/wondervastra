import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

/** Preview deployments ship a catalogue snapshot; serverless disks are read-only, so it's copied to /tmp on cold start. */
function previewSnapshotUrl() {
  const src = path.join(/* turbopackIgnore: true */ process.cwd(), "preview", "catalogue.db");
  const dest = path.join("/tmp", "vastravibe-preview.db");
  if (!fs.existsSync(dest) && fs.existsSync(src)) fs.copyFileSync(src, dest);
  return `file:${dest}`;
}

export function resolveDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.PREVIEW_MODE === "1") return previewSnapshotUrl();
  return "file:./data/vastravibe.db";
}

function makeClient(): Client {
  const url = resolveDbUrl();
  if (url.startsWith("file:")) {
    fs.mkdirSync(path.dirname(path.resolve(url.slice(5))), { recursive: true });
  }
  return createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
}

const globalForDb = globalThis as unknown as { __vvClient?: Client; __vvPragma?: boolean };
export const client = globalForDb.__vvClient ?? makeClient();
globalForDb.__vvClient = client;

if (!globalForDb.__vvPragma && resolveDbUrl().startsWith("file:")) {
  globalForDb.__vvPragma = true;
  client.execute("PRAGMA journal_mode=WAL").catch(() => {});
  client.execute("PRAGMA busy_timeout=5000").catch(() => {});
}

export const db = drizzle(client, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
