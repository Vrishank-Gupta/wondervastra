import { defineConfig, devices } from "@playwright/test";

const env: Record<string, string> = {
  DATABASE_URL: "file:./data/e2e.db",
  UPLOAD_DIR: "./data/e2e-uploads",
  ADMIN_EMAIL: "e2e@vastravibe.test",
  ADMIN_PASSWORD: "e2e-password-1234",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  RAZORPAY_WEBHOOK_SECRET: "e2e-webhook-secret",
  RESEND_API_KEY: "",
  WHATSAPP_TOKEN: "",
  // Blank on purpose: production builds also read local .env files, and tests must never touch real services.
  CLOUDINARY_CLOUD_NAME: "",
  CLOUDINARY_API_KEY: "",
  CLOUDINARY_API_SECRET: "",
  DATABASE_AUTH_TOKEN: "",
  EMAIL_FROM: "",
  WHATSAPP_PHONE_NUMBER_ID: "",
  CRON_SECRET: "",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
  NEXT_DIST_DIR: ".next-e2e",
};

// E2E_PROD=1 runs the suite against a production build (next build + next start) instead of next dev.
const prod = process.env.E2E_PROD === "1";
if (prod) Object.assign(env, { VV_TEST_MODE: "1", NEXT_DIST_DIR: ".next-e2e-prod" });
const serve = prod ? "npx next build && npx next start -p 3100" : "npx next dev -p 3100";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `rm -rf data/e2e.db* data/e2e-uploads && npx tsx scripts/migrate.ts && npx tsx scripts/seed.ts && ${serve}`,
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: prod ? 600_000 : 240_000,
    env,
  },
});
