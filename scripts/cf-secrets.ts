/**
 * Uploads the runtime secrets from .env.production.local to the Cloudflare Worker (encrypted at rest).
 * Blank values are skipped; values never print. Run: npx tsx scripts/cf-secrets.ts
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

const env = parse(readFileSync(".env.production.local"));
// Only what the running site reads. Admin login and contact details live in the database instead.
const KEYS = [
  "DATABASE_URL", "DATABASE_AUTH_TOKEN", "CRON_SECRET",
  "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
  "RESEND_API_KEY", "EMAIL_FROM", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID",
];
const secrets = Object.fromEntries(KEYS.filter((k) => env[k]?.trim()).map((k) => [k, env[k].trim()]));
const r = spawnSync("npx", ["wrangler", "secret", "bulk"], { input: JSON.stringify(secrets), stdio: ["pipe", "inherit", "inherit"] });
console.log(r.status === 0 ? `✓ Uploaded: ${Object.keys(secrets).join(", ")}` : "✗ Upload failed");
process.exit(r.status ?? 1);
