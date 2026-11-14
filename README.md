# WonderVastra

Online store and seller admin for WonderVastra. Built with Next.js, TypeScript, Tailwind and SQLite (libSQL).

## Run it on your computer

```bash
npm install
cp .env.example .env     # then set ADMIN_EMAIL and ADMIN_PASSWORD
npm run db:setup         # creates the database and the sample catalogue
npm run dev
```

- Store: http://localhost:3000
- Seller admin: http://localhost:3000/admin

Until keys are added, online payment is simulated (development only) and messages are logged but not sent.
The admin dashboard has a "Before you launch" checklist showing what's left.

## Connect the services

Each is optional until you need it. Add the keys to `.env` (or your host's environment) and restart.

### Razorpay
1. In the Razorpay dashboard, go to Account & Settings → API Keys. Start with **Test mode** keys.
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. Add a webhook pointing to `https://your-site/api/webhooks/razorpay` with the events `payment.captured`, `payment.failed` and `refund.processed`. Put its secret in `RAZORPAY_WEBHOOK_SECRET`.
4. Place a test order and a test refund, confirm both in the Razorpay dashboard, then switch to live keys.

Razorpay's account review looks for policy pages. They're at `/info/shipping-policy`, `/info/returns-policy`, `/info/privacy-policy`, `/info/terms` and `/info/contact`.

### Email (Resend)
Verify your domain at resend.com, then set `RESEND_API_KEY` and `EMAIL_FROM`.

### WhatsApp Cloud API
Set `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`, and get these templates approved in Meta Business Manager, language `en`, with the same names and values in the same order:

| Template | Body values |
| --- | --- |
| `vv_order_placed` | name, order no, total, tracking link, feedback link |
| `vv_order_packed` | name, order no, order link |
| `vv_order_shipped` | name, order no, courier, AWB, tracking link |
| `vv_out_for_delivery` | name, order no, tracking link |
| `vv_order_delivered` | name, order no, feedback link |
| `vv_order_cancelled` | name, order no, order link |
| `vv_order_refunded` | name, amount, order no, order link |
| `vv_return_update` | name, order no, status, order link |
| `vv_back_in_stock` | product name, product link |
| `vv_launched` | product name, product link (sent when a Coming soon listing goes live) |
| `vv_login_otp` | code (use Meta's Authentication category) |

Example for `vv_order_shipped`:

> Hi {{1}}, your WonderVastra order {{2}} has shipped via {{3}} (AWB {{4}}). Track it here: {{5}}

Until this is approved, every order page has **Send on WhatsApp** buttons that open WhatsApp with the message ready to send. Buyers can log in by email in the meantime.

## Hosting

**Simplest: one small VPS.** Run `npm run build && npm run db:setup && npm start` behind Nginx or Caddy with HTTPS. The database and uploads are files under `data/`, so **back that folder up daily**.

**Serverless (for example Vercel).** A serverless host has no lasting disk, so use Turso for the database (`DATABASE_URL`, `DATABASE_AUTH_TOKEN`) and Cloudinary for images (`CLOUDINARY_*`).

In both cases:
- Set `NEXT_PUBLIC_SITE_URL` to your real domain **before running `npm run build`**, because it's fixed at build time. It's used in every link sent to buyers and in WhatsApp/Instagram link previews.
- Set a strong `ADMIN_PASSWORD`, or leave it blank to have one generated and printed once.
- Set `CRON_SECRET` and call `GET /api/cron` with `Authorization: Bearer <secret>` every 15 minutes. This returns stock held by unpaid checkouts.

## Tests

```bash
npm test            # pricing and payment signature rules
npm run test:e2e    # full browser flows, using a separate test database
```

`npm run test:e2e` needs a browser once: `npx playwright install chromium-headless-shell`.

## How it fits together

- `src/lib/pricing.ts`: every discount, delivery and cap rule. The cart and checkout share it, so the price shown is the price charged.
- `src/lib/orders.ts`: order lifecycle, stock holds, payment confirmation.
- `src/lib/notifications.ts`: all email and WhatsApp wording.
- `src/app/admin/actions.ts`: every seller action, each checked for login and written to the audit log.
- `scripts/seed.ts`: the sample catalogue.

Sample listings use temporary stock photos from Pexels (`scripts/stock-photos.ts`, credits in `public/seed/CREDITS.md`). They show similar products, not yours: replace them from the admin before selling. The dashboard checklist counts how many are left.

Launching with a few items? Tick **Coming soon** on a listing (Stock display & limits). It stays visible with a badge and a Notify me signup, and can't be bought. Untick it to launch: everyone who signed up gets one message.

New product types need no code. Add a category and listings from the admin, and rename the option labels per listing (for example "Finish" instead of "Colour" for jewellery).

## Sharing a look-only preview (Netlify)

A preview shows the shop to others without taking orders: `PREVIEW_MODE=1` adds an "Ordering opens soon" bar, refuses checkout, switches off the seller admin and keeps search engines out. It runs from a copy of the catalogue with all customer, order and admin data removed.

1. `npm run preview:snapshot` (writes `preview/catalogue.db` from your current catalogue)
2. Deploy from a copy of the project **without** `.env` or `data/`, with `PREVIEW_MODE=1` and `NEXT_PUBLIC_SITE_URL` set on the Netlify site: `npx netlify-cli deploy --prod`
3. To take it down: delete the site at app.netlify.com, or `npx netlify-cli sites:delete`.

A preview is a snapshot: catalogue changes appear only after you redo steps 1 and 2.
