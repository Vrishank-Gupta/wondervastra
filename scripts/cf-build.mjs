/**
 * Cloudflare build. OpenNext copies any .env files it finds into the deployed code, so they're moved aside
 * for the build and always put back afterwards. Real secrets live only in Cloudflare (npm run cf:secrets).
 */
import { existsSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";

const hidden = [".env", ".env.local", ".env.production", ".env.production.local", ".env.development"].filter((f) => existsSync(f));
const restore = () => { for (const f of hidden) if (existsSync(`${f}.cfbuild-hidden`)) renameSync(`${f}.cfbuild-hidden`, f); };
process.on("SIGINT", () => { restore(); process.exit(130); });
process.on("SIGTERM", () => { restore(); process.exit(143); });
for (const f of hidden) renameSync(f, `${f}.cfbuild-hidden`);
try {
  const r = spawnSync("npx", ["opennextjs-cloudflare", "build"], {
    stdio: "inherit",
    env: { ...process.env, CF_BUILD: "1", NEXT_PUBLIC_SITE_URL: process.env.SITE_URL || "https://wondervastra.in" },
  });
  process.exitCode = r.status ?? 1;
} finally {
  restore();
}
