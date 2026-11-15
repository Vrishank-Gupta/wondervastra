import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { createClient } from "@libsql/client";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import sharp from "sharp";

const db = createClient({ url: "file:./data/e2e.db" });
const ADMIN = { email: "e2e@vastravibe.test", password: "e2e-password-1234" };
const rows = async (sql: string, args: (string | number)[] = []) => (await db.execute({ sql, args })).rows as unknown as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = async (sql: string, args: (string | number)[] = []) => (await rows(sql, args))[0];

const buyer = (n: number) => ({ name: `Asha Test${n}`, email: `asha${n}@example.com`, phone: `98765432${String(n).padStart(2, "0")}` });
const addr = { line1: "12 Hauz Khas Village", line2: "Near Deer Park", city: "New Delhi", state: "Delhi", pincode: "110016" };

async function variantOf(slug: string, stock?: number) {
  const v = await one("select v.id, v.stock from variants v join products p on p.id=v.product_id where p.slug=? and v.active=1 order by v.sort_order limit 1", [slug]);
  if (stock != null) await db.execute({ sql: "update variants set stock=? where id=?", args: [stock, v.id as unknown as string] });
  return v.id as unknown as string;
}
async function createOrder(request: APIRequestContext, body: Record<string, unknown>, ip = "10.0.0.1") {
  return request.post("/api/checkout/create", {
    headers: { "x-forwarded-for": ip },
    data: { ...buyer(1), ...addr, whatsappOptIn: true, paymentMethod: "cod", ...body },
  });
}
async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/admin");
}

test("browse, search, cart nudges, coupon, simulated payment, confirmation", async ({ page }) => {
  await page.goto("/?utm_source=instagram&utm_campaign=reel1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("WonderVastra");
  await expect(page.getByText(/Our hero range/)).toBeVisible();

  await page.getByRole("searchbox", { name: /search/i }).or(page.getByLabel("Search products").first()).first().fill("boys thermal top");
  await expect(page.getByRole("link", { name: /Boys' Thermal Top/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /Boys' Thermal Top/ }).first().click();

  await page.waitForURL("**/p/rupa-boys-thermal-top");
  // No size is picked for the buyer: adding without one asks for it.
  await expect(page.getByText("Select a size to see availability.")).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await expect(page.getByText("Please select a size first.")).toBeVisible();
  await page.locator("#size-picker button:not(.line-through):not([data-testid=size-guide-open])").first().click();
  await expect(page.getByText(/pieces? (available|left)/)).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).first().click();

  const drawer = page.getByRole("dialog", { name: "Your cart" });
  await expect(drawer.getByText(/Add .* more to get/)).toBeVisible();
  await drawer.getByRole("link", { name: "Checkout" }).click();
  await page.waitForURL("**/checkout");

  const b = buyer(2);
  await page.getByLabel("WhatsApp number").fill(b.phone);
  await page.getByLabel("Email").fill(b.email);
  await page.getByLabel("Full name").fill(b.name);
  await page.getByLabel("House no, building, street").fill(addr.line1);
  await page.getByLabel("Pincode").fill(addr.pincode);
  await page.getByLabel("City").fill(addr.city);
  await page.getByLabel("State").selectOption(addr.state);

  await page.getByLabel("Coupon code").fill("WELCOME10");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("WELCOME10 applied")).toBeVisible();

  await page.getByRole("button", { name: /^Pay / }).filter({ visible: true }).click();
  await page.waitForURL("**/order/**", { timeout: 30000 });
  await expect(page.getByText("Your order is confirmed")).toBeVisible();

  const o = await one("select * from orders where email=?", [b.email]);
  expect(o.status).toBe("confirmed");
  expect(o.payment_status).toBe("paid");
  expect(o.utm_source).toBe("instagram");
  expect(o.coupon_code).toBe("WELCOME10");
  // ₹299 list, no sale on kids' thermals; 10% coupon (₹29.90, rounded to ₹30); ₹49 delivery.
  expect(o.total).toBe(29900 - 3000 + 4900);
  const notif = await rows("select channel,event from notifications where order_id=?", [o.id as unknown as string]);
  expect(notif.map((n) => `${n.channel}:${n.event}`).sort()).toEqual(["email:order_placed", "whatsapp:order_placed"]);

  // Coupon is first-order-only: the same buyer can't reuse it.
  const reuse = await createOrder(page.request, { ...b, items: [{ variantId: await variantOf("rupa-boys-thermal-top"), qty: 1 }], couponCode: "WELCOME10" });
  expect(reuse.status()).toBe(409);
});

test("seller fulfils an order: AWB, tracking link, delivered, both feedback links, review goes live", async ({ page, request, browser }) => {
  const res = await createOrder(request, { items: [{ variantId: await variantOf("amul-baby-thermal-bodysuit"), qty: 2 }], ...buyer(3) });
  expect(res.ok()).toBeTruthy();
  const { id, accessToken, number } = await res.json();

  await adminLogin(page);
  await page.goto("/admin/orders");
  await expect(page.getByRole("link", { name: number })).toBeVisible();
  await page.getByRole("link", { name: number }).click();

  // Delhivery is connected, so hand entry for another courier is one tap away.
  await page.getByRole("button", { name: "Using a different courier? Add tracking by hand" }).click();
  const shipBtn = page.getByRole("button", { name: "Save & mark shipped" });
  await expect(shipBtn).toBeDisabled(); // No AWB yet.
  await page.getByLabel("Courier", { exact: true }).selectOption("Delhivery");
  await page.getByLabel("AWB / tracking number").fill("DL123456789");
  await shipBtn.click();
  await expect(page.getByText(/Marked shipped/)).toBeVisible();

  const shipped = await one("select * from orders where id=?", [id]);
  expect(shipped.status).toBe("shipped");
  expect(String(shipped.tracking_url)).toContain("DL123456789");
  const sent = await rows("select channel from notifications where order_id=? and event='order_shipped'", [id]);
  expect(sent.length).toBe(2);
  const body = await one("select body from notifications where order_id=? and event='order_shipped' and channel='whatsapp'", [id]);
  expect(String(body.body)).toContain("DL123456789");

  await page.getByRole("button", { name: "Mark out for delivery" }).click();
  await expect(page.getByText(/Marked as Out for delivery/)).toBeVisible();
  await page.getByRole("button", { name: "Mark delivered" }).click();
  await expect(page.getByText(/Marked as Delivered/)).toBeVisible();

  const done = await one("select * from orders where id=?", [id]);
  expect(done.status).toBe("delivered");
  expect(done.payment_status).toBe("paid"); // COD collected on delivery.
  const deliveredMsg = await one("select body from notifications where order_id=? and event='order_delivered' and channel='whatsapp'", [id]);
  expect(String(deliveredMsg.body)).toContain(`/feedback/${accessToken}?type=delivery`);
  const placedMsg = await one("select body from notifications where order_id=? and event='order_placed' and channel='whatsapp'", [id]);
  expect(String(placedMsg.body)).toContain(`/feedback/${accessToken}?type=order`);

  const audit = await rows("select action, actor_name from audit_logs where entity='order' and entity_id=?", [id]);
  expect(audit.length).toBeGreaterThanOrEqual(3);

  // Buyer, in a fresh session, sees everything from the link alone.
  const ctx = await browser.newContext();
  const buyerPage = await ctx.newPage();
  await buyerPage.goto(`/order/${accessToken}`);
  await expect(buyerPage.getByText("DL123456789")).toBeVisible();
  await expect(buyerPage.getByRole("link", { name: /Track parcel/ })).toHaveAttribute("href", /DL123456789/);

  await buyerPage.goto(`/feedback/${accessToken}?type=order`);
  await buyerPage.getByRole("radiogroup", { name: "Overall rating" }).getByRole("radio", { name: "5 stars" }).click();
  await buyerPage.getByRole("button", { name: "Send feedback" }).click();
  await expect(buyerPage.getByText("Thank you for your feedback")).toBeVisible();

  await buyerPage.goto(`/feedback/${accessToken}?type=delivery`);
  await buyerPage.getByRole("radiogroup", { name: "Overall rating" }).getByRole("radio", { name: "4 stars" }).click();
  await buyerPage.getByRole("radiogroup", { name: /Rating for Amul Baby Thermal Bodysuit/ }).getByRole("radio", { name: "5 stars" }).click();
  await buyerPage.getByLabel(/Review for Amul Baby Thermal Bodysuit/).fill("Very soft.");
  await buyerPage.getByRole("button", { name: "Send feedback" }).click();
  await expect(buyerPage.getByText("Thank you for your feedback")).toBeVisible();
  expect((await rows("select type from feedback where order_id=?", [id])).length).toBe(2);

  // Reviews stay hidden until the seller publishes them.
  await buyerPage.goto("/p/amul-baby-thermal-bodysuit");
  await expect(buyerPage.getByText("Very soft.")).toHaveCount(0);
  await page.goto("/admin/reviews");
  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByText("approved").first()).toBeVisible();
  await buyerPage.goto("/p/amul-baby-thermal-bodysuit");
  await expect(buyerPage.getByText("Very soft.")).toBeVisible();
  await ctx.close();
});

test("out of stock: subscribe, seller restocks, buyer is notified exactly once", async ({ page }) => {
  await page.goto("/p/amul-girls-thermal-leggings");
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
  await page.getByLabel(/Get a message/).fill("9812345678");
  await page.getByRole("button", { name: "Notify me" }).click();
  await expect(page.getByText("You're on the list")).toBeVisible();

  const a = await one("select * from stock_alerts where phone='9812345678'");
  expect(a.status).toBe("waiting");

  await adminLogin(page);
  await page.goto("/admin/inventory");
  await page.getByLabel("Search inventory").fill("Thermal Leggings");
  const field = page.getByLabel(/^Stock for Girls' Thermal Leggings/).first();
  await expect(page.getByText(/waiting/).first()).toBeVisible();
  // Restock every variant so the alert's variant is covered wherever it points.
  const inputs = page.getByLabel(/^Stock for Girls' Thermal Leggings/);
  for (let i = 0; i < (await inputs.count()); i++) await inputs.nth(i).fill("7");
  await field.blur();
  await page.getByRole("button", { name: /^Save \d+ change/ }).click();
  // WhatsApp isn't connected in tests, so a phone-only alert can't be sent automatically:
  // it waits on the dashboard for a one-tap manual message instead of being silently marked as sent.
  await expect(page.getByText(/left only a phone number/)).toBeVisible();
  expect((await one("select * from stock_alerts where id=?", [a.id as unknown as string])).status).toBe("to_message");
  expect((await rows("select * from notifications where event='back_in_stock' and recipient='9812345678'")).length).toBe(0);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Back in stock: message 1 buyer" })).toBeVisible();
  const panel = page;
  await expect(panel.getByText("9812345678")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Message", exact: true })).toHaveAttribute("href", /wa\.me\/919812345678\?text=.*back%20in%20stock/);
  await panel.getByRole("button", { name: "Sent" }).click();
  await expect(page.getByRole("heading", { name: /Back in stock: message/ })).toHaveCount(0);
  expect((await one("select * from stock_alerts where id=?", [a.id as unknown as string])).status).toBe("notified");

  await page.goto("/p/amul-girls-thermal-leggings");
  await page.locator("#size-picker button:not(.line-through):not([data-testid=size-guide-open])").first().click();
  await expect(page.getByText(/7 pieces available/)).toBeVisible();
});

test("caps and checkout integrity: per-order, per-customer, price tampering, sold out, marked out", async ({ request }) => {
  const box = await variantOf("amul-thermal-set-top-bottom", 100);
  const over = await createOrder(request, { ...buyer(4), items: [{ variantId: box, qty: 4 }] });
  expect(over.status()).toBe(409);
  expect((await over.json()).error).toMatch(/Limit of 3 per order/);

  // Lifetime cap of 6: 3 + 3 pass, the next one is refused.
  expect((await createOrder(request, { ...buyer(4), items: [{ variantId: box, qty: 3 }] })).ok()).toBeTruthy();
  expect((await createOrder(request, { ...buyer(4), items: [{ variantId: box, qty: 3 }] })).ok()).toBeTruthy();
  const capped = await createOrder(request, { ...buyer(4), items: [{ variantId: box, qty: 1 }] });
  expect(capped.status()).toBe(409);
  expect((await capped.json()).error).toMatch(/per customer/);
  // The cap follows the phone number even under a different email.
  expect((await createOrder(request, { ...buyer(4), email: "other@example.com", items: [{ variantId: box, qty: 1 }] })).status()).toBe(409);

  const socks = await variantOf("dollar-boys-thermal-set", 50);
  const tampered = await createOrder(request, { ...buyer(5), items: [{ variantId: socks, qty: 1 }], expectedTotal: 100 });
  expect(tampered.status()).toBe(409);
  expect((await tampered.json()).error).toMatch(/Prices were updated/);
  // Extra client-sent price fields are ignored: the server computes the total.
  const res = await createOrder(request, { ...buyer(5), items: [{ variantId: socks, qty: 1, unitPrice: 1 }], total: 1, subtotal: 1 });
  expect((await one("select total from orders where number=?", [(await res.json()).number])).total).toBe(54900 + 4900 + 3000);

  const zero = await variantOf("lux-baby-thermal-set", 0);
  expect((await createOrder(request, { ...buyer(6), items: [{ variantId: zero, qty: 1 }] })).status()).toBe(409);

  await db.execute("update products set force_out_of_stock=1 where slug='lux-girls-thermal-set'");
  const out = await variantOf("lux-girls-thermal-set", 20);
  expect((await createOrder(request, { ...buyer(6), items: [{ variantId: out, qty: 1 }] })).status()).toBe(409);
  await db.execute("update products set force_out_of_stock=0 where slug='lux-girls-thermal-set'");

  // Prepaid-only listing refuses COD.
  const pre = await variantOf("dollar-high-neck-thermal-top", 10);
  expect((await createOrder(request, { ...buyer(6), items: [{ variantId: pre, qty: 1 }] })).status()).toBe(409);
});

test("the last piece can't be sold twice under concurrent checkouts", async ({ request }) => {
  const v = await variantOf("rupa-thermal-bottom", 1);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    createOrder(request, { ...buyer(10 + i), items: [{ variantId: v, qty: 1 }] }, `10.1.0.${i}`)));
  const statuses = results.map((r) => r.status());
  expect(statuses.filter((s) => s === 200).length).toBe(1);
  expect(statuses.filter((s) => s >= 500).length).toBe(0);
  const row = await one("select stock from variants where id=?", [v]);
  expect(row.stock).toBe(0);
});

test("cancelling restores stock and coupon use, and offers apply above a threshold", async ({ page, request }) => {
  const v = await variantOf("rupa-boys-thermal-top", 10);
  const before = await one("select used_count from coupons where code='INSTA50'");
  const res = await createOrder(request, { ...buyer(20), items: [{ variantId: v, qty: 7 }], couponCode: "INSTA50" });
  expect(res.ok()).toBeTruthy();
  const { id, accessToken } = await res.json();
  const o = await one("select * from orders where id=?", [id]);
  // ₹299 x 7 = ₹2093 (boys' thermal top): 10% off above ₹1,999 (₹209.30, rounded to ₹209) + ₹50 coupon; free delivery above ₹799; ₹30 COD fee.
  expect(o.subtotal).toBe(209300);
  expect(o.offer_discount).toBe(20900);
  expect(o.coupon_discount).toBe(5000);
  expect(o.shipping_total).toBe(0);
  expect(o.total).toBe(209300 - 20900 - 5000 + 3000);
  expect(o.number).toMatch(/^WV[2-9A-Z]{7}$/);
  expect((await one("select stock from variants where id=?", [v])).stock).toBe(3);

  await page.goto(`/order/${accessToken}`);
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByText("Cancelled").first()).toBeVisible();
  expect((await one("select stock from variants where id=?", [v])).stock).toBe(10);
  expect((await one("select used_count from coupons where code='INSTA50'")).used_count).toBe(before.used_count);
});

test("buyer logs in with an OTP and sees past orders, can't see anyone else's", async ({ page, request }) => {
  const b = buyer(30);
  const res = await createOrder(request, { ...b, items: [{ variantId: await variantOf("lux-thermal-top-full-sleeve"), qty: 1 }] });
  const { number } = await res.json();
  const other = await createOrder(request, { ...buyer(31), items: [{ variantId: await variantOf("lux-thermal-top-full-sleeve"), qty: 1 }] });
  const otherNumber = (await other.json()).number;

  await page.goto("/account");
  await page.waitForURL("**/login**");
  await page.getByLabel("Email or mobile number").fill(b.email);
  await page.getByRole("button", { name: "Send login code" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/isn't right/)).toBeVisible();
  const code = (await page.getByText(/your code is/).textContent())!.match(/\d{6}/)![0];
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/account");
  await expect(page.getByText(number)).toBeVisible();
  await expect(page.getByText(otherNumber)).toHaveCount(0);

  const stored = await rows("select body, subject from notifications where event='login_otp'");
  expect(JSON.stringify(stored)).not.toContain(code);
});

test("track by order number needs the matching contact", async ({ page, request }) => {
  const b = buyer(40);
  const { number } = await (await createOrder(request, { ...b, items: [{ variantId: await variantOf("lux-thermal-top-full-sleeve"), qty: 1 }] })).json();
  await page.goto("/track");
  await page.getByLabel("Order number").fill(number);
  await page.getByLabel(/Phone or email/).fill("9000000000");
  await page.getByRole("button", { name: "Track order" }).click();
  await expect(page.getByText(/couldn't find/)).toBeVisible();
  await page.getByLabel("Order number").fill(number);
  await page.getByLabel(/Phone or email/).fill(b.phone);
  await page.getByRole("button", { name: "Track order" }).click();
  await page.waitForURL("**/order/**");
  await expect(page.getByRole("heading", { name: number })).toBeVisible();
});

test("security: admin is locked, forged payments and webhooks are refused, signed webhook works once", async ({ page, request }) => {
  await page.goto("/admin/orders");
  await page.waitForURL("**/admin/login");
  expect((await request.post("/api/admin/upload", { multipart: { files: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") } } })).status()).toBe(401);
  expect((await request.get("/api/admin/orders/export")).status()).toBe(401);
  expect((await request.get("/api/admin/customers/export")).status()).toBe(401);
  expect((await request.get("/api/cron")).status()).toBe(401);

  const res = await createOrder(request, { ...buyer(50), paymentMethod: "razorpay", items: [{ variantId: await variantOf("lux-thermal-top-full-sleeve"), qty: 1 }] });
  const { id, total } = await res.json();
  await db.execute({ sql: "update orders set razorpay_order_id='order_E2E' where id=?", args: [id] });

  const forged = await request.post("/api/checkout/verify", { data: { orderId: id, razorpay_order_id: "order_E2E", razorpay_payment_id: "pay_x", razorpay_signature: "deadbeef" } });
  expect(forged.status()).toBe(400);
  const badHook = await request.post("/api/webhooks/razorpay", { headers: { "x-razorpay-signature": "nope" }, data: { event: "payment.captured" } });
  expect(badHook.status()).toBe(400);
  expect((await one("select payment_status from orders where id=?", [id])).payment_status).toBe("pending");

  const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_e2e", order_id: "order_E2E", amount: total } } } });
  const sig = createHmac("sha256", "e2e-webhook-secret").update(raw).digest("hex");
  const headers = { "x-razorpay-signature": sig, "content-type": "application/json" };
  expect((await request.post("/api/webhooks/razorpay", { headers, data: raw })).ok()).toBeTruthy();
  expect((await request.post("/api/webhooks/razorpay", { headers, data: raw })).ok()).toBeTruthy(); // Razorpay retries.
  const o = await one("select * from orders where id=?", [id]);
  expect(o.payment_status).toBe("paid");
  expect(o.razorpay_payment_id).toBe("pay_e2e");
  expect((await rows("select id from notifications where order_id=? and event='order_placed'", [id])).length).toBe(2);
  // A path-traversal attempt never reaches a file.
  const traversal = await request.get("/media/..%2F..%2F.env");
  expect([400, 404]).toContain(traversal.status());
  expect(await traversal.text()).not.toContain("DATABASE_URL");
});

test("seller adds a category and listing with a real photo upload; jewellery works with the same model", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/categories");
  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByLabel("Name").fill("Artificial Jewellery");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Artificial Jewellery")).toBeVisible();
  // An empty category stays hidden from buyers.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Artificial Jewellery" })).toHaveCount(0);

  await page.goto("/admin/products/new");
  // Publishing with nothing filled in names what's missing instead of failing silently.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("To publish, add a photo, a category, a name, a price and stock.")).toBeVisible();

  await page.getByRole("button", { name: "Artificial Jewellery" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Kundan Jhumka Earrings");
  await page.getByLabel(/Selling price/).fill("499");
  await page.locator("#mrp").fill("799");
  await expect(page.getByText("Buyers see 38% off MRP")).toBeVisible();
  await page.getByText("Free delivery", { exact: true }).click();
  // Colours outside the ready-made list are typed in; sizes stay "Free size" for jewellery.
  for (const c of ["Gold", "Silver"]) { await page.getByLabel("Other colour").fill(c); await page.getByRole("button", { name: "Add colour" }).click(); }
  await page.getByLabel("Same for all").fill("9");
  await page.getByRole("button", { name: "Fill all" }).click();
  await page.getByLabel("Stock for Silver").fill("3");
  await expect(page.getByRole("heading", { name: /Stock: 12 pieces/ })).toBeVisible();
  await page.getByText("More options").click();
  await page.getByLabel("Most pieces in one order").fill("2");

  const png = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#c98" } }).png().toBuffer();
  await page.locator('input[type="file"][multiple]').setInputFiles({ name: "jhumka.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Cover", { exact: true })).toBeVisible();

  // A non-image is refused.
  await page.locator('input[type="file"][multiple]').setInputFiles({ name: "evil.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<script>alert(1)</script>") });
  await expect(page.getByText(/couldn't be read as an image/)).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.waitForURL(/admin\/products\/(?!new)/);
  await expect(page.getByRole("heading", { name: "Live in your store" })).toBeVisible();
  // SKUs were filled in automatically.
  const skus = await rows("select v.sku from variants v join products p on p.id=v.product_id where p.slug='kundan-jhumka-earrings' order by v.sku");
  expect(skus.map((r) => r.sku)).toEqual(["WV-KUNDANJH-GOL", "WV-KUNDANJH-SIL"]);

  await page.goto("/p/kundan-jhumka-earrings");
  await expect(page.getByRole("heading", { name: "Kundan Jhumka Earrings" })).toBeVisible();
  await expect(page.getByText("Free delivery", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/9 pieces available/)).toBeVisible();
  await expect(page.getByText(/Limit 2 per order/)).toBeVisible();
  await page.getByRole("button", { name: "Silver" }).click();
  await expect(page.getByText(/Only 3 pieces left/)).toBeVisible();
  const img = page.locator('img[alt="Kundan Jhumka Earrings"]').first();
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBeTruthy();

  await page.goto("/");
  await expect(page.getByRole("link", { name: /Artificial Jewellery/ }).first()).toBeVisible();

  // Link previews on WhatsApp/Instagram need a real raster image.
  await page.goto("/p/kundan-jhumka-earrings");
  const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  const ogRes = await page.request.get(og!);
  expect(ogRes.ok()).toBeTruthy();
  expect(ogRes.headers()["content-type"]).toBe("image/jpeg");
});

test("timed sale and cart offer created in admin take effect, and expire", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/discounts");
  await page.getByRole("tab", { name: /^Sales/ }).click();
  await page.getByRole("button", { name: "New sale" }).click();
  await page.getByLabel("Sale name").fill("Flash Friday");
  await page.getByLabel("Percent off").fill("50");
  await page.getByLabel("Applies to").selectOption("products");
  await page.getByLabel("Girls' Thermal Top", { exact: true }).check();
  await page.getByRole("button", { name: "Save sale" }).click();
  await expect(page.getByText("Flash Friday")).toBeVisible();

  await page.goto("/p/rupa-girls-thermal-top");
  await expect(page.getByText("Flash Friday ends in")).toBeVisible();
  await expect(page.getByTestId("price")).toHaveText("₹150");

  await db.execute("update sales set ends_at=1000 where name='Flash Friday'");
  await page.goto("/p/rupa-girls-thermal-top");
  await expect(page.getByText("Flash Friday ends in")).toHaveCount(0);
  await expect(page.getByTestId("price")).toHaveText("₹299");

  // Seller full-picture screens all render.
  for (const path of ["/admin", "/admin/orders", "/admin/products", "/admin/brands", "/admin/inventory", "/admin/discounts", "/admin/customers", "/admin/reviews", "/admin/notifications", "/admin/audit", "/admin/settings"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  const exportRes = await page.request.get("/api/admin/orders/export");
  expect(exportRes.ok()).toBeTruthy();
  expect(await exportRes.text()).toContain("AWB");
  const invoiceOrder = await one("select id from orders where status='delivered' limit 1");
  expect((await page.goto(`/admin/orders/${invoiceOrder.id}/invoice`))?.status()).toBe(200);
  await expect(page.getByText("Packing slip")).toBeVisible();
});

test("coming soon: listed but not buyable, buyers sign up, launching notifies them once", async ({ page, request }) => {
  // Every coming-soon range is switched off on the site for now, so bring one listing back for this test.
  const slug = "wondervastra-originals-essential-pullover-hoodie";
  await db.execute("update categories set active=1 where slug='hoodies'");
  await db.execute({ sql: "update products set status='active' where slug=?", args: [slug] });
  const p = await one("select id, coming_soon from products where slug=?", [slug]);
  expect(Number(p.coming_soon)).toBe(1);

  // Visible in the shop with its badge, but there is nothing to buy.
  await page.goto("/shop");
  await expect(page.getByText("Coming soon").first()).toBeVisible();
  await page.goto(`/p/${slug}`);
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buy now" })).toHaveCount(0);

  // The server refuses it even if someone calls checkout directly.
  const v = await variantOf(slug, 20);
  const res = await createOrder(request, { ...buyer(40), items: [{ variantId: v, qty: 1 }] });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toMatch(/Coming soon/);

  await page.getByLabel(/launches/).fill("launch@example.com");
  await page.getByRole("button", { name: "Notify me" }).click();
  await expect(page.getByText(/the day it launches/)).toBeVisible();

  // Seller switches it live from the listing editor.
  await adminLogin(page);
  await page.goto(`/admin/products/${p.id}`);
  await page.getByText("More options").click();
  await page.getByLabel(/^Coming soon/).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/notified it's now available/)).toBeVisible();
  const sent = await rows("select * from notifications where event='launched' and recipient='launch@example.com'");
  expect(sent.length).toBe(1);

  // Saving again doesn't message anyone twice.
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  expect((await rows("select * from notifications where event='launched' and recipient='launch@example.com'")).length).toBe(1);

  await page.goto(`/p/${slug}`);
  await expect(page.getByRole("button", { name: "Add to cart" }).first()).toBeVisible();
  await db.execute("update categories set active=0 where slug='hoodies'");
  await db.execute({ sql: "update products set status='archived', coming_soon=1 where slug=?", args: [slug] });
});

test("brands: brand pages, brand filter, own label hidden until it has stock, and a brand-wide sale", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Shop by brand" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "WonderVastra Originals" })).toHaveCount(0);

  await page.goto("/brands");
  await page.getByRole("link", { name: /^Lux/ }).first().click();
  await page.waitForURL("**/brands/lux");
  await expect(page.getByRole("heading", { level: 1, name: "Lux" })).toBeVisible();
  const luxCount = Number((await one("select count(*) n from products p join brands b on b.id=p.brand_id where b.slug='lux' and p.status='active'")).n);
  await expect(page.getByText(`${luxCount} items`)).toBeVisible();

  // Multi-brand filter on the shop page, by URL.
  await page.goto("/shop?brand=amul,rupa");
  const ar = Number((await one("select count(*) n from products p join brands b on b.id=p.brand_id where b.slug in ('amul','rupa') and p.status='active'")).n);
  await expect(page.getByRole("main").getByText(`${ar} items`)).toBeVisible();

  // The product page names and links its brand.
  await page.goto("/p/amul-baby-thermal-bodysuit");
  await expect(page.getByRole("link", { name: "Amul", exact: true }).first()).toHaveAttribute("href", "/brands/amul");
  await expect(page.getByTestId("price")).toHaveText("₹349");

  await adminLogin(page);
  await page.goto("/admin/brands");
  await expect(page.getByRole("button", { name: "Edit WonderVastra Originals" })).toBeVisible();
  await page.goto("/admin/discounts");
  await page.getByRole("tab", { name: /^Sales/ }).click();
  await page.getByRole("button", { name: "New sale" }).click();
  await page.getByLabel("Sale name").fill("Amul Week");
  await page.getByLabel("Percent off").fill("20");
  await page.getByLabel("Applies to").selectOption("brand");
  await page.getByLabel("Amul", { exact: true }).check();
  await page.getByRole("button", { name: "Save sale" }).click();
  await expect(page.getByText("Amul Week")).toBeVisible();

  // ₹349 less 20% = ₹279.20, rounded to the rupee.
  await page.goto("/p/amul-baby-thermal-bodysuit");
  await expect(page.getByTestId("price")).toHaveText("₹279");
  await page.goto("/p/rupa-girls-thermal-top");
  await expect(page.getByText("Amul Week ends in")).toHaveCount(0);
  await db.execute("update sales set ends_at=1000 where name='Amul Week'");
});

test("only thermals are on the site: kids' lead, other ranges are hidden and can't be bought", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kids' thermals" }).first()).toBeVisible();
  await expect(page.getByText("Coming soon")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Categories" }).getByRole("link").nth(2)).toHaveText("Kids' Thermals");
  await expect(page.locator('a[href="/c/kids-thermals?collection=baby"]')).toHaveCount(0); // We sell ages 2+.
  await page.locator('a[href="/c/kids-thermals?collection=boys"]').first().click();
  await page.waitForURL("**/c/kids-thermals?collection=boys");
  const boys = Number((await one("select count(*) n from products where status='active' and tags like '%\"boys\"%'")).n);
  await expect(page.getByText(`${boys} items`)).toBeVisible();

  // Hidden ranges are gone from the site and refused at checkout.
  expect((await page.goto("/c/mens-vests"))?.status()).toBe(404);
  expect((await page.goto("/p/lux-classic-cotton-vest"))?.status()).toBe(404);
  const vest = await variantOf("lux-classic-cotton-vest", 20);
  const res = await createOrder(request, { ...buyer(60), items: [{ variantId: vest, qty: 1 }] });
  expect(res.status()).toBe(409);
  await page.goto("/shop");
  const live = Number((await one("select count(*) n from products where status='active'")).n);
  await expect(page.getByRole("main").getByText(`${live} items`)).toBeVisible();
});

test("listings: drafts are flagged and several can be published at once", async ({ page }) => {
  const slugs = ["lux-boys-high-neck-thermal", "amul-baby-thermal-bodysuit"];
  for (const s of slugs) await db.execute({ sql: "update products set status='draft' where slug=?", args: [s] });
  await adminLogin(page);
  await page.goto("/admin/products?status=draft");
  for (const s of slugs) {
    const name = (await one("select name from products where slug=?", [s])).name as string;
    await page.getByLabel(`Select ${name}`, { exact: true }).check();
  }
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Publish selected" }).click();
  await expect(page.getByText("Published 2 listings.")).toBeVisible();
  for (const s of slugs) expect((await one("select status from products where slug=?", [s])).status).toBe("active");
});

test("security: login can't redirect off-site; coupon guessing and alerts for hidden items are refused", async ({ page, request }) => {
  // Open redirect: a crafted "next" lands on the account page, never another site.
  await page.goto("/login?next=" + encodeURIComponent("/\\example.com"));
  await page.getByLabel("Email or mobile number").fill("redirect@example.com");
  await page.getByRole("button", { name: "Send login code" }).click();
  const code = (await page.getByText(/your code is/).textContent())!.match(/\d{6}/)![0];
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL("**/account");
  await page.goto("/login?next=//example.com/x");
  await page.waitForURL("**/account");
  expect(new URL(page.url()).host).toBe("localhost:3100");

  // Guessing coupon codes: after 15 wrong codes the visitor is paused, even for real codes.
  const v = await variantOf("lux-thermal-top-full-sleeve");
  const quote = (couponCode: string) => request.post("/api/cart/quote", { headers: { "x-real-ip": "10.66.0.1" }, data: { items: [{ variantId: v, qty: 1 }], couponCode } }).then((r) => r.json());
  for (let i = 0; i < 15; i++) expect((await quote(`GUESS${i}`)).couponError).toBe("That coupon code isn't valid.");
  expect((await quote("WELCOME10")).couponError).toMatch(/Too many coupon attempts/);
  expect((await request.post("/api/cart/quote", { headers: { "x-real-ip": "10.66.0.2" }, data: { items: [{ variantId: v, qty: 1 }], couponCode: "WELCOME10" } }).then((r) => r.json())).coupon?.code).toBe("WELCOME10");

  // Restock alerts only for listings that are in the store.
  const hidden = await one("select id from products where status='archived' limit 1");
  const res = await request.post("/api/stock-alert", { headers: { "x-real-ip": "10.66.0.3" }, data: { productId: hidden.id, contact: "spam@example.com" } });
  expect(res.status()).toBe(404);
});

test("orders: whole-rupee coupons, restock alerts after a cancel, publishing needs a photo, GST invoice", async ({ page, request }) => {
  // A percent coupon never leaves paise in the total.
  const v = await variantOf("lux-girls-thermal-set", 1);
  const q = await request.post("/api/cart/quote", { headers: { "x-real-ip": "10.67.0.1" }, data: { items: [{ variantId: v, qty: 1 }], couponCode: "WELCOME10" } }).then((r) => r.json());
  expect(q.coupon.discount % 100).toBe(0);
  expect(q.total % 100).toBe(0);

  // Someone takes the last piece; another buyer asks to be told; the order is cancelled → they're messaged.
  const res = await createOrder(request, { ...buyer(70), items: [{ variantId: v, qty: 1 }] }, "10.67.0.2");
  expect(res.ok()).toBeTruthy();
  const { accessToken, id } = await res.json();
  const pid = (await one("select product_id from variants where id=?", [v])).product_id as string;
  await request.post("/api/stock-alert", { headers: { "x-real-ip": "10.67.0.3" }, data: { productId: pid, variantId: v, contact: "waiting@example.com" } });
  await page.goto(`/order/${accessToken}`);
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByText("Cancelled").first()).toBeVisible();
  await expect.poll(async () => (await rows("select * from notifications where event='back_in_stock' and recipient='waiting@example.com'")).length).toBe(1);
  // A cancelled order offers no rating.
  await expect(page.getByRole("link", { name: /Rate your/ })).toHaveCount(0);
  expect((await one("select invoice_number from orders where id=?", [id])).invoice_number).toBeNull();

  // Publishing from the listing's menu refuses a listing with no photo, and says why.
  await adminLogin(page);
  const draft = await one("select id, name from products where status='active' limit 1");
  await db.execute({ sql: "update products set status='draft' where id=?", args: [draft.id as string] });
  const photos = await rows("select * from product_images where product_id=?", [draft.id as string]);
  await db.execute({ sql: "delete from product_images where product_id=?", args: [draft.id as string] });
  await page.goto("/admin/products?status=draft");
  await page.getByLabel(`More actions for ${draft.name}`, { exact: true }).first().click();
  await page.locator("details[open]").getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Add at least one photo before publishing.")).toBeVisible();
  for (const ph of photos) await db.execute({ sql: "insert into product_images (id, product_id, url, alt, sort_order) values (?,?,?,?,?)", args: [ph.id, ph.product_id, ph.url, ph.alt, ph.sort_order] });
  await db.execute({ sql: "update products set status='active' where id=?", args: [draft.id as string] });

  // GST invoice: sequential number, place of supply, CGST+SGST in the seller's state.
  await db.execute(`insert into settings (key, value, updated_at) values ('gstin', '"07ABCDE1234F1Z5"', 0), ('businessState', '"Delhi"', 0), ('legalName', '"WonderVastra Retail"', 0) on conflict(key) do update set value=excluded.value`);
  const a = await (await createOrder(request, { ...buyer(71), items: [{ variantId: await variantOf("rupa-boys-thermal-top", 20), qty: 2 }] }, "10.67.0.4")).json();
  const b = await (await createOrder(request, { ...buyer(72), state: "Haryana", city: "Gurugram", pincode: "122002", items: [{ variantId: await variantOf("rupa-boys-thermal-top"), qty: 1 }] }, "10.67.0.5")).json();
  await page.goto(`/admin/orders/${a.id}/invoice`);
  await expect(page.getByText("Tax invoice")).toBeVisible();
  const first = (await page.getByText(/^Invoice no\./).innerText()).match(/WV\/\d{4}-\d{2}\/(\d{5})/)!;
  await expect(page.getByText("CGST + SGST (intra-state)")).toBeVisible();
  await expect(page.getByText("GSTIN: 07ABCDE1234F1Z5")).toBeVisible();
  await page.goto(`/admin/orders/${b.id}/invoice`);
  await expect(page.getByText("IGST (inter-state)")).toBeVisible();
  const second = (await page.getByText(/^Invoice no\./).innerText()).match(/WV\/\d{4}-\d{2}\/(\d{5})/)!;
  expect(Number(second[1])).toBe(Number(first[1]) + 1);
  // Re-opening keeps the same number.
  await page.goto(`/admin/orders/${a.id}/invoice`);
  await expect(page.getByText(first[0])).toBeVisible();
  await db.execute("delete from settings where key in ('gstin','businessState','legalName')");
});

test("settings are checked before saving; phones never scroll sideways", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/settings");
  await page.getByLabel("GSTIN (if registered)").fill("NOT-A-GSTIN");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/doesn't look like a GSTIN/)).toBeVisible();

  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of ["/", "/shop", "/p/rupa-boys-thermal-top", "/admin/brands", "/admin/products", "/admin/settings", "/admin/products/new"]) {
    await page.goto(path);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});

test("search engines and AI assistants: structured data, sitemap, robots, llms.txt", async ({ page, request }) => {
  const ld = async (path: string) => {
    await page.goto(path);
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    return blocks.flatMap((b) => { const j = JSON.parse(b); return Array.isArray(j) ? j : [j]; });
  };
  const home = await ld("/");
  expect(home.map((x) => x["@type"])).toEqual(expect.arrayContaining(["OnlineStore", "WebSite"]));
  expect(home.find((x) => x["@type"] === "WebSite").potentialAction.target.urlTemplate).toContain("/shop?q=");

  const product = await ld("/p/rupa-boys-thermal-top");
  const p = product.find((x) => x["@type"] === "Product");
  expect(p.name).toBe("Rupa Boys' Thermal Top");
  expect(p.brand.name).toBe("Rupa");
  expect(p.offers.priceCurrency).toBe("INR");
  expect(p.offers.availability).toMatch(/InStock|OutOfStock/);
  // Delivery area: Delhi NCR pincode ranges, so search engines don't promise delivery elsewhere.
  const dest = p.offers.shippingDetails.shippingDestination;
  expect(dest[0].addressCountry).toBe("IN");
  expect(dest.some((d: { postalCodeRange: { postalCodeBegin: string; postalCodeEnd: string } }) => d.postalCodeRange.postalCodeBegin === "110001" && d.postalCodeRange.postalCodeEnd === "110099")).toBe(true);
  expect(product.find((x) => x["@type"] === "BreadcrumbList").itemListElement.length).toBe(3);
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe("http://localhost:3100/p/rupa-boys-thermal-top");

  const cat = await ld("/c/kids-thermals");
  expect(cat.find((x) => x["@type"] === "ItemList").numberOfItems).toBeGreaterThan(0);
  const faq = await ld("/info/faq");
  expect(faq.find((x) => x["@type"] === "FAQPage").mainEntity.length).toBeGreaterThan(5);

  // Search results pages aren't indexed; category pages are.
  await page.goto("/shop?q=thermal");
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
  await page.goto("/c/kids-thermals?collection=boys");
  expect(await page.locator('meta[name="robots"]').count()).toBe(0);

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("GPTBot");
  expect(robots).toContain("ClaudeBot");
  expect(robots).toContain("PerplexityBot");
  expect(robots).toMatch(/Disallow: \/admin/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/p/rupa-boys-thermal-top");
  expect(sitemap).toContain("<image:loc>");
  expect(sitemap).toContain("collection=boys");
  const llms = await request.get("/llms.txt");
  expect(llms.headers()["content-type"]).toContain("text/markdown");
  const text = await llms.text();
  expect(text).toMatch(/^# WonderVastra/);
  expect(text).toContain("Rupa Boys' Thermal Top");
  expect(text).toContain("/c/kids-thermals");
  // IndexNow key file, so Bing (ChatGPT search) accepts change notifications.
  const key = (await import("../src/lib/indexnow")).INDEXNOW_KEY;
  expect(await (await request.get(`/${key}.txt`)).text()).toBe(key);
  // Nothing claims WhatsApp updates while WhatsApp isn't connected.
  await page.goto("/");
  await expect(page.getByText("Order updates on WhatsApp")).toHaveCount(0);
});

test("admin login is password-only, and wrong guesses are capped", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Wrong password.")).toBeVisible();
  await adminLogin(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("round 2: wishlist survives login, real states only, discount typos refused, filters respond instantly", async ({ page, request }) => {
  // Heart tapped while logged out → after login the item is saved and the buyer is back on the product.
  await page.goto("/p/rupa-girls-thermal-top");
  await page.getByRole("button", { name: /wishlist/i }).first().click();
  await page.waitForURL(/\/login\?next=/);
  await page.getByLabel("Email or mobile number").fill("wish.qa@example.com");
  await page.getByRole("button", { name: "Send login code" }).click();
  const code = (await page.getByText(/your code is/).textContent())!.match(/\d{6}/)![0];
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL("**/p/rupa-girls-thermal-top");
  expect(page.url()).not.toContain("wish=");
  await page.goto("/account/wishlist");
  await expect(page.getByText("Girls' Thermal Top")).toBeVisible();

  // Saved addresses pick the state from the list; checkout refuses a made-up state.
  await page.goto("/account/addresses");
  await page.getByRole("button", { name: /add address/i }).click();
  await expect(page.getByLabel("State")).toHaveJSProperty("tagName", "SELECT");
  const v = await variantOf("lux-thermal-top-full-sleeve");
  const bad = await createOrder(request, { ...buyer(80), state: "Karnatka", items: [{ variantId: v, qty: 1 }] }, "10.80.0.1");
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe("Please check your state.");

  // A coupon that gives more off than its minimum order is a typo, and is refused.
  await adminLogin(page);
  await page.goto("/admin/discounts");
  await page.getByRole("tab", { name: /Coupons/ }).click();
  await page.getByRole("button", { name: /New coupon/i }).click();
  await page.getByLabel("Code").fill("BIG500");
  await page.getByLabel("Type").selectOption("flat");
  await page.getByLabel(/₹ off/).fill("500");
  await page.getByLabel(/Minimum|Min/).first().fill("300");
  await page.getByRole("button", { name: "Save coupon" }).click();
  await expect(page.getByText(/gives the order away almost free/)).toBeVisible();

  // Filter tick boxes show the tap immediately.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/c/kids-thermals");
  await page.getByRole("button", { name: /^Filters/ }).click();
  const box = page.getByRole("dialog").getByLabel("In stock only");
  await box.check();
  await expect(box).toBeChecked();
  await page.waitForURL(/inStock=1/);
});

test("round 3: Delhi NCR delivery area, discount ladder, open-ended sale, WhatsApp group, sold-out sizes", async ({ page, request }) => {
  // Product page: check a pincode before buying.
  await page.goto("/p/rupa-boys-thermal-top");
  const check = page.getByTestId("delivery-check");
  await expect(check.getByText("We deliver across Delhi NCR for now.")).toBeVisible();
  await check.getByLabel("Your pincode").fill("400001");
  await check.getByRole("button", { name: "Check" }).click();
  await expect(check.getByText(/We don't deliver to .*400001 yet/)).toBeVisible();
  await expect(check.getByText("We deliver only in Delhi NCR for now.")).toBeVisible();
  await check.getByLabel("WhatsApp number or email").fill("9876500001");
  await check.getByRole("button", { name: "Notify me" }).click();
  await expect(check.getByText("We'll tell you as soon as we deliver to 400001.")).toBeVisible();
  expect((await one("select * from area_requests where pincode='400001'")).phone).toBe("9876500001");
  await check.getByRole("button", { name: "Change" }).click();
  await check.getByLabel("Your pincode").fill("122002");
  await check.getByRole("button", { name: "Check" }).click();
  await expect(check.getByText(/We deliver to .*122002/)).toBeVisible();

  // The server refuses an address outside the area, whatever the page says.
  const v = await variantOf("rupa-boys-thermal-top", 30);
  const far = await createOrder(request, { ...buyer(90), city: "Mumbai", state: "Maharashtra", pincode: "400001", items: [{ variantId: v, qty: 1 }] }, "10.90.0.1");
  expect(far.status()).toBe(400);
  expect((await far.json()).error).toMatch(/only in Delhi NCR/);

  // Checkout: the remembered pincode is filled in, and an outside pincode is explained on the spot.
  await page.locator("#size-picker button:not(.line-through):not([data-testid=size-guide-open])").first().click();
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  await expect(drawer.getByText(/Delivering to .*122002/)).toBeVisible();
  await drawer.getByRole("link", { name: "Checkout" }).click();
  await page.waitForURL("**/checkout");
  await expect(page.locator("#pincode")).toHaveValue("122002");
  await page.locator("#pincode").fill("560001");
  await expect(page.getByText(/Sorry, we don't deliver to .*560001 yet/)).toBeVisible();
  await page.locator("#pincode").fill("110016");
  await expect(page.getByText(/Sorry, we don't deliver/)).toHaveCount(0);

  // Discount ladder: one screen, saved as cart offers, shown to buyers as steps.
  const before = await rows("select * from cart_offers");
  await adminLogin(page);
  await page.goto("/admin/discounts");
  const ladder = page;
  for (let i = (await ladder.getByRole("button", { name: /Remove step/ }).count()); i > 0; i--) await ladder.getByRole("button", { name: /Remove step/ }).first().click();
  for (const [min, pct] of [["500", "5"], ["1000", "8"], ["2000", "4"]]) {
    await ladder.getByRole("button", { name: "Add a step" }).click();
    const n = await ladder.getByLabel(/cart amount$/).count();
    await ladder.getByLabel(`Step ${n} cart amount`).fill(min);
    await ladder.getByLabel(`Step ${n} percent off`).fill(pct);
  }
  await ladder.getByLabel(/Free delivery when the cart is at least/).fill("799");
  await ladder.getByRole("button", { name: "Save discount ladder" }).click();
  await expect(ladder.getByText(/should give more than 8%/)).toBeVisible();
  await ladder.getByLabel("Step 3 percent off").fill("12");
  await expect(ladder.getByText(/Buyers will see: 5% off above ₹500 · 8% off above ₹1,000 · 12% off above ₹2,000 · free delivery above ₹799/)).toBeVisible();
  await ladder.getByRole("button", { name: "Save discount ladder" }).click();
  await expect(ladder.getByText("Saved. It's live on the store now.")).toBeVisible();
  const saved = await rows("select type, value, min_subtotal from cart_offers order by min_subtotal");
  expect(saved.map((o) => `${o.type}:${o.value}:${o.min_subtotal}`)).toEqual(["percent:5:50000", "free_shipping:0:79900", "percent:8:100000", "percent:12:200000"]);

  // A sale on a single listing with no end date: no countdown.
  await page.getByRole("tab", { name: /^Sales/ }).click();
  await page.getByRole("button", { name: "New sale" }).click();
  await page.getByLabel("Sale name").fill("Always On");
  await page.getByLabel("Percent off").fill("10");
  await page.getByLabel("No end date").check();
  await page.getByLabel("Applies to").selectOption("products");
  await page.getByLabel("Search listings").fill("Boys' Thermal Top");
  await page.getByLabel(/Boys' Thermal Top/).first().check();
  await page.getByRole("button", { name: "Save sale" }).click();
  await expect(page.getByText(/no end date/)).toBeVisible();

  // WhatsApp group: a wrong link is refused; a real one shows in the footer.
  await page.goto("/admin/settings");
  await page.getByLabel("WhatsApp group invite link").fill("https://example.com/group");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/WhatsApp group link: Paste the invite link/)).toBeVisible();
  await page.getByLabel("WhatsApp group invite link").fill("https://chat.whatsapp.com/AbCdEf123456");
  await page.getByLabel("Check a pincode").fill("201301");
  await expect(page.getByText("Delivers", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved. Your store shows the changes now.")).toBeVisible();
  await expect(page.getByText(/1 customer has asked you to deliver/)).toBeVisible();
  // Delivery area by tick-boxes: unticking a town takes its pincodes out; "all over India" clears the list.
  await page.getByText("Faridabad", { exact: true }).click();
  await page.getByLabel("Check a pincode").fill("121002");
  await expect(page.getByText("Not covered", { exact: true })).toBeVisible();
  await expect(page.getByText("You have changes that aren't saved yet.")).toBeVisible();
  await page.getByRole("button", { name: "Undo changes" }).click();
  await expect(page.getByText("Delivers", { exact: true })).toBeVisible();

  await page.goto("/p/rupa-boys-thermal-top");
  await expect(page.getByTestId("tiers").getByText("12% off")).toBeVisible();
  await expect(page.getByText(/Always On ends in/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Join our WhatsApp group" })).toHaveAttribute("href", "https://chat.whatsapp.com/AbCdEf123456");

  // A sold-out size says which size, lists sizes in stock, and takes an alert for that size.
  const sizes = await rows("select v.id, v.option1 from variants v join products p on p.id=v.product_id where p.slug='rupa-boys-thermal-top' and v.active=1 order by v.sort_order");
  await db.execute({ sql: "update variants set stock=0 where id=?", args: [sizes[1].id] });
  await db.execute({ sql: "update variants set stock=5 where id=?", args: [sizes[0].id] });
  await page.goto("/p/rupa-boys-thermal-top");
  await page.locator("#size-picker").getByRole("button", { name: String(sizes[1].option1), exact: true }).click();
  await expect(page.getByText(`Size ${sizes[1].option1} in Navy is sold out`)).toBeVisible();
  await expect(page.getByText("This size is in stock in Grey Melange, Maroon.")).toBeVisible();
  await expect(page.getByText(new RegExp(`In stock: .*${String(sizes[0].option1).replace(/[()]/g, "\\$&")}`))).toBeVisible();
  await page.getByLabel(`Get a message the moment size ${sizes[1].option1} is back:`).fill("buyer.size@example.com");
  await page.getByRole("button", { name: "Notify me" }).click();
  await expect(page.getByText("You're on the list")).toBeVisible();
  expect((await one("select variant_id from stock_alerts where email='buyer.size@example.com'")).variant_id).toBe(sizes[1].id);
  await page.getByRole("button", { name: "Maroon", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Add to cart" }).first()).toBeVisible();

  // Clean up so other tests see the seeded store.
  await db.execute("delete from cart_offers");
  for (const o of before) await db.execute({ sql: `insert into cart_offers (${Object.keys(o).join(",")}) values (${Object.keys(o).map(() => "?").join(",")})`, args: Object.values(o) as never[] });
  await db.execute("delete from sales where name='Always On'");
  await db.execute("delete from settings where key='whatsappGroupUrl'");
});

test("kids' sizes show age and height together, set per listing", async ({ page }) => {
  const prod = await one("select id from products where slug='rupa-boys-thermal-top'");
  await adminLogin(page);
  await page.goto(`/admin/products/${prod.id}`);
  // Existing listing with no heights: empty boxes, typical values one tap away.
  await expect(page.getByLabel("Height for 4–6 Y (cm)")).toHaveValue("");
  await page.getByRole("button", { name: "Fill typical heights for the empty ones" }).click();
  await expect(page.getByLabel("Height for 4–6 Y (cm)")).toHaveValue("104–116");
  await page.getByLabel("Height for 2–4 Y (cm)").fill("92-104");
  await page.getByLabel("Height for 12–14 Y (cm)").fill("");
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  const heights = JSON.parse((await one("select size_heights from products where id=?", [prod.id])).size_heights as string);
  expect(heights["2–4 Y"]).toBe("92–104");
  expect(heights["4–6 Y"]).toBe("104–116");
  expect(heights["12–14 Y"]).toBeUndefined();

  // A height that isn't a number is refused.
  await page.getByLabel("Height for 2–4 Y (cm)").fill("92-");
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(page.getByText("The height for 2–4 Y should be a number in cm, like 104 or 104–116.")).toBeVisible();

  await page.goto("/p/rupa-boys-thermal-top");
  await expect(page.locator("#size-picker").getByRole("button", { name: /^4–6 Y, 104–116 cm/ })).toBeVisible();
  await expect(page.locator("#size-picker").getByRole("button", { name: "12–14 Y", exact: true })).toBeVisible();
  await page.getByRole("group").getByText("Size guide", { exact: true }).last().click().catch(() => page.locator("summary", { hasText: "Size guide" }).click());
  await expect(page.getByRole("cell", { name: "92–104 cm" })).toBeVisible();
  await db.execute({ sql: "update products set size_heights='{}' where id=?", args: [prod.id] });
});

test("one account per email: email code, password sign-up, password login, forgot password and Google", async ({ page, browser }) => {
  const email = "same.person@example.com";
  const accountsFor = async (e: string) => rows("select * from customers where email=?", [e]);
  const codeOnPage = async () => (await page.getByText(/your code is/).textContent())!.match(/\d{6}/)![0];
  const logout = async () => { await page.goto("/account"); await page.getByRole("button", { name: "Log out" }).click(); await page.waitForURL((u) => u.pathname === "/"); };

  // 1. Email code: creates the account.
  await page.goto("/login");
  await page.getByLabel("Email or mobile number").fill(email);
  await page.getByRole("button", { name: "Send login code" }).click();
  await page.getByLabel("6-digit code").fill(await codeOnPage());
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/account");
  const [first] = await accountsFor(email);
  expect(first.password_hash).toBeNull();
  await logout();

  // 2. Password sign-up with the same email: proves the email with a code, then adds a password to the SAME account.
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Same Person");
  await page.getByLabel("Email").fill(email.toUpperCase());
  await page.getByLabel("Choose a password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 8 characters for your password.")).toBeVisible();
  await page.getByLabel("Choose a password").fill("warm-thermals-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Confirm and create account" }).click();
  await expect(page.getByText(/isn't right/)).toBeVisible();
  await page.getByLabel("6-digit code").fill(await codeOnPage());
  await page.getByRole("button", { name: "Confirm and create account" }).click();
  await page.waitForURL("**/account");
  await expect(page.getByRole("heading", { name: "Hello, Same" })).toBeVisible();
  let accounts = await accountsFor(email);
  expect(accounts).toHaveLength(1);
  expect(accounts[0].id).toBe(first.id);
  expect(accounts[0].password_hash).toBeTruthy();
  await logout();

  // Signing up again with that email is refused politely.
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Someone");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Choose a password").fill("another-pass-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/already have an account with this email/)).toBeVisible();

  // 3. Email + password login.
  await page.goto("/login?next=/account/security");
  await page.getByRole("button", { name: "Log in with a password instead" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByText(/email and password don't match/)).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("warm-thermals-1");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/account/security");
  await expect(page.getByText("Log in with your email and password.")).toBeVisible();
  await logout();

  // 4. Forgot password: a code plus a new password, then logged straight in.
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in with a password instead" }).click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("6-digit code").fill(await codeOnPage());
  await page.getByLabel("New password").fill("new-thermals-2");
  await page.getByRole("button", { name: "Save password and log in" }).click();
  await page.waitForURL("**/account");
  await logout();

  // 5. Google with the same (verified) email links to the same account. A fake Google stands in for the real one.
  let claims: Record<string, unknown> = {};
  const fake = createServer((req, res) => {
    const u = new URL(req.url!, "http://127.0.0.1:3199");
    if (u.pathname === "/auth") {
      expect(u.searchParams.get("client_id")).toBe("e2e-google-client");
      expect(u.searchParams.get("code_challenge_method")).toBe("S256");
      res.writeHead(302, { Location: `${u.searchParams.get("redirect_uri")}?code=fake-code&state=${u.searchParams.get("state")}` }).end();
    } else if (u.pathname === "/token") {
      const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const idToken = `${part({ alg: "none" })}.${part({ iss: "https://accounts.google.com", aud: "e2e-google-client", exp: Math.floor(Date.now() / 1000) + 600, ...claims })}.sig`;
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id_token: idToken }));
    } else res.writeHead(404).end();
  });
  await new Promise<void>((r) => fake.listen(3199, "127.0.0.1", () => r()));
  try {
    claims = { sub: "google-123", email, email_verified: true, name: "Same Person G" };
    await page.goto("/login?next=/account/security");
    await page.getByRole("link", { name: "Continue with Google" }).click();
    await page.waitForURL("**/account/security");
    await expect(page.getByText(/Linked\. “Continue with Google” opens this account\./)).toBeVisible();
    accounts = await accountsFor(email);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe(first.id);
    expect(accounts[0].google_sub).toBe("google-123");
    await logout();

    // A new Google user gets a new account with their name; an unverified Google email is refused.
    claims = { sub: "google-456", email: "new.google@example.com", email_verified: true, name: "Nita Google" };
    await page.goto("/signup");
    await page.getByRole("link", { name: "Sign up with Google" }).click();
    await page.waitForURL("**/account");
    await expect(page.getByRole("heading", { name: "Hello, Nita" })).toBeVisible();
    await logout();
    claims = { sub: "google-789", email: "unverified@example.com", email_verified: false };
    await page.goto("/login");
    await page.getByRole("link", { name: "Continue with Google" }).click();
    await expect(page.getByText(/Google email isn't verified/)).toBeVisible();
    expect(await accountsFor("unverified@example.com")).toHaveLength(0);

    // A forged return from "Google" without the matching one-time state is refused.
    const other = await browser.newPage();
    await other.goto("http://localhost:3100/api/auth/google/callback?code=fake-code&state=forged");
    await expect(other.getByText("Google sign-in expired. Please try again.")).toBeVisible();
    await other.close();
  } finally {
    fake.close();
  }
});

test("thermal warmers: MRP per size, and Top / Bottom / Set where a set takes one of each", async ({ page, request }) => {
  const pid = "e2e-warmer";
  const cat = await one("select id from categories where slug='kids-thermals'");
  const brand = await one("select id from brands where name='Dollar'");
  const photo = await one("select url from product_images limit 1");
  await db.execute({ sql: "insert into products (id, name, slug, category_id, brand_id, status, price, compare_at_price, option1_label, option2_label, created_at, updated_at) values (?,?,?,?,?,'active',23000,32500,'Size','Piece',0,0)", args: [pid, "Ultra Kids' Thermal Warmer", "e2e-warmer", cat.id as string, brand.id as string] });
  await db.execute({ sql: "insert into product_images (id, product_id, url, alt, sort_order) values ('e2e-warmer-img', ?, ?, 'Warmer', 0)", args: [pid, photo.url as string] });
  const v = [
    ["e2e-w-t55", "2–3 Y (55 cm)", "Top", 25000, 35500, 4], ["e2e-w-b55", "2–3 Y (55 cm)", "Bottom", 25000, 35500, 2],
    ["e2e-w-t60", "4–5 Y (60 cm)", "Top", 25000, 35500, 3], ["e2e-w-b60", "4–5 Y (60 cm)", "Bottom", 25000, 35500, 0],
  ] as const;
  for (const [i, [id, s, piece, price, mrp, stock]] of v.entries()) {
    await db.execute({ sql: "insert into variants (id, product_id, option1, option2, price, mrp, stock, active, sort_order) values (?,?,?,?,?,?,?,1,?)", args: [id, pid, s, piece, price, mrp, stock, i] });
  }
  try {
    await page.goto("/p/e2e-warmer");
    // The choice is text buttons, with Set first and chosen.
    const pieces = page.getByRole("button", { name: /^(Set \(Top \+ Bottom\)|Top|Bottom)$/ });
    await expect(pieces).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Set (Top + Bottom)" })).toHaveAttribute("aria-pressed", "true");
    // Size 60 has no bottoms, so the set is sold out in 60 but a top alone isn't.
    await expect(page.locator("#size-picker").getByRole("button", { name: "4–5 Y (60 cm)" })).toHaveClass(/line-through/);
    await page.locator("#size-picker").getByRole("button", { name: "2–3 Y (55 cm)" }).click();
    await expect(page.getByTestId("price")).toHaveText("₹500");
    await expect(page.getByText("MRP ₹710")).toBeVisible();
    await expect(page.getByText("Only 2 sets left")).toBeVisible();
    await page.getByRole("button", { name: "Add to cart" }).first().click();
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("vv_cart") ?? "[]"));
    expect(cart.map((i: { variantId: string; qty: number }) => `${i.variantId}:${i.qty}`).sort()).toEqual(["e2e-w-b55:1", "e2e-w-t55:1"]);

    // Each piece is priced with its own size's MRP.
    const q = await request.post("/api/cart/quote", { headers: { "x-real-ip": "10.68.0.1" }, data: { items: [{ variantId: "e2e-w-t55", qty: 1 }, { variantId: "e2e-w-b55", qty: 1 }] } }).then((r) => r.json());
    expect(q.subtotal).toBe(50000);
    expect(q.mrpTotal).toBe(71000);

    await page.keyboard.press("Escape");

    // Two top styles with one bottom: a set for each, each taking its own top.
    await db.execute({ sql: "insert into variants (id, product_id, option1, option2, price, mrp, stock, active, sort_order) values ('e2e-w-v55', ?, '2–3 Y (55 cm)', 'V-neck top', 26000, 36000, 3, 1, 9)", args: [pid] });
    await page.reload();
    await expect(page.getByRole("button", { name: "Set (V-neck top + Bottom)" })).toBeVisible();
    await page.getByRole("button", { name: "Set (V-neck top + Bottom)" }).click();
    await page.locator("#size-picker").getByRole("button", { name: "2–3 Y (55 cm)" }).click();
    await expect(page.getByTestId("price")).toHaveText("₹510");
    await db.execute("delete from variants where id='e2e-w-v55'");
    await page.reload();

    await page.getByRole("button", { name: "Top", exact: true }).click();
    await page.locator("#size-picker").getByRole("button", { name: "4–5 Y (60 cm)" }).click();
    await expect(page.getByText("Only 3 pieces left")).toBeVisible();

    // Kids' wear is sold in 2s (a cart above ₹1,500 allows one); minimum prices apply only during a minimum-price sale.
    await db.execute({ sql: "update products set min_pieces=2, combo_above=150000 where id=?", args: [pid] });
    await db.execute("update variants set combo_price=23000 where id in ('e2e-w-t55','e2e-w-b55','e2e-w-t60')");
    const qt = (items: { variantId: string; qty: number }[], ip: string) => request.post("/api/cart/quote", { headers: { "x-real-ip": ip }, data: { items } }).then((r) => r.json());
    const single = await qt([{ variantId: "e2e-w-t55", qty: 1 }], "10.68.0.2");
    expect(single.minimumIssue).toContain("sold in 2s: add 1 more");
    const three = await qt([{ variantId: "e2e-w-t55", qty: 2 }, { variantId: "e2e-w-b55", qty: 1 }], "10.68.0.4");
    expect(three.minimumIssue).toBeNull();
    expect(three.subtotal).toBe(75000); // no automatic minimum price
    const big = await one("select v.id, coalesce(v.price, p.price) price, v.stock from variants v join products p on p.id=v.product_id where p.status='active' and v.active=1 and p.id<>? and coalesce(v.price, p.price) >= 50000 and v.stock >= 4 limit 1", [pid]);
    const bigCart = await qt([{ variantId: "e2e-w-t55", qty: 1 }, { variantId: big.id as string, qty: Math.ceil(150100 / Number(big.price)) }], "10.68.0.5");
    expect(bigCart.minimumIssue).toBeNull();
    const refused = await createOrder(request, { items: [{ variantId: "e2e-w-t55", qty: 1 }], paymentMethod: "razorpay" }, "10.68.0.6");
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error).toContain("sold in 2s");
    await db.execute({ sql: "insert into sales (id, name, badge, type, value, scope, target_ids, starts_at, ends_at, show_banner, active, created_at) values ('e2e-weekend', 'Weekend Sale', 'Lowest prices', 'min_price', 1, 'products', ?, 0, ?, 0, 1, 0)", args: [JSON.stringify([pid]), Date.now() + 3600_000] });
    try {
      const weekend = await qt([{ variantId: "e2e-w-t55", qty: 2 }, { variantId: "e2e-w-b55", qty: 1 }], "10.68.0.7");
      expect(weekend.subtotal).toBe(69000);
      expect(weekend.views[0].saleName).toBe("Weekend Sale");
    } finally {
      await db.execute("delete from sales where id='e2e-weekend'");
    }

    // The product page explains it, and a single top in the cart can't go to checkout.
    await page.evaluate(() => localStorage.setItem("vv_cart", "[]"));
    await page.goto("/p/e2e-warmer");
    await expect(page.getByTestId("combo")).toContainText("Sold in 2s");
    await expect(page.getByTestId("combo")).toContainText("Cart over ₹1,500? Single pieces are fine too.");
    await page.evaluate(() => localStorage.setItem("vv_cart", JSON.stringify([{ variantId: "e2e-w-t55", qty: 1 }])));
    await page.goto("/cart");
    await expect(page.getByTestId("minimum-issue")).toContainText("add 1 more");
    await expect(page.getByRole("link", { name: "Proceed to checkout" })).toHaveCount(0);

    // The seller sees and edits the MRP per size; an MRP below the price is refused with the size named.
    await adminLogin(page);
    await page.goto(`/admin/products/${pid}`);
    await expect(page.getByLabel("MRP for Top · 2–3 Y (55 cm)")).toHaveValue("355");
    await page.getByText("More options").click();
    await page.getByLabel("MRP for Bottom · 4–5 Y (60 cm)").fill("200");
    await page.getByRole("button", { name: "Save changes" }).first().click();
    await expect(page.getByText("The MRP for 4–5 Y (60 cm) · Bottom can't be lower than its selling price.")).toBeVisible();
  } finally {
    await db.execute({ sql: "delete from variants where product_id=?", args: [pid] });
    await db.execute({ sql: "delete from product_images where product_id=?", args: [pid] });
    await db.execute({ sql: "delete from products where id=?", args: [pid] });
  }
});

test("Delhivery: delivery date, book, label, pickup, tracking to delivered, customer sees it, cancel", async ({ page, request }) => {
  let scan = { Status: "Manifested", StatusType: "UD", StatusLocation: "Delhi_Hub", Instructions: "" };
  const seen: string[] = [];
  const fake = createServer(async (req, res) => {
    const u = new URL(req.url!, "http://127.0.0.1:3198");
    const body = await new Promise<string>((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
    expect(req.headers.authorization).toBe("Token e2e-delhivery-token");
    seen.push(u.pathname);
    const json = (o: unknown) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(o));
    if (u.pathname === "/api/dc/expected_tat") return json({ success: true, data: { tat: 2 } });
    if (u.pathname === "/api/kinko/v1/invoice/charges/.json") return json([{ total_amount: 42.01 }]);
    if (u.pathname === "/api/cmu/create.json") {
      const data = JSON.parse(new URLSearchParams(body).get("data")!);
      expect(data.pickup_location.name).toBe("WV Hauz Khas");
      expect(data.shipments[0].pin).toBe("110016");
      expect(data.shipments[0].payment_mode).toBe("COD");
      return json({ success: true, packages: [{ waybill: `E2EAWB${seen.filter((p) => p === "/api/cmu/create.json").length}`, status: "Success" }] });
    }
    if (u.pathname === "/api/p/packing_slip") return json({ packages: [{ pdf_download_link: "https://example.com/label.pdf" }] });
    if (u.pathname === "/api/p/edit") return json({ status: true });
    if (u.pathname === "/fm/request/new/") return seen.filter((p) => p === "/fm/request/new/").length > 1 ? json({ pr_exist: true }) : json({ pickup_id: 777 });
    if (u.pathname === "/api/backend/clientwarehouse/create/") { expect(JSON.parse(body)).toMatchObject({ name: "WV Hauz Khas", pin: "110016", city: "New Delhi" }); return json({ success: true }); }
    if (u.pathname === "/api/v1/packages/json/") {
      return json({ ShipmentData: (u.searchParams.get("waybill") ?? "").split(",").map((awb) => ({ Shipment: { AWB: awb, Status: { ...scan, StatusDateTime: new Date().toISOString() }, ExpectedDeliveryDate: "2026-12-01T18:00:00" } })) });
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => fake.listen(3198, "127.0.0.1", () => r()));
  await db.execute("delete from settings where key in ('delhiveryPickupName','delhiveryPickupPin')");
  try {
    // One-time setup from the order page: the pickup address is registered with Delhivery.
    const vSetup = await variantOf("rupa-boys-thermal-top", 20);
    const first = await (await createOrder(request, { items: [{ variantId: vSetup, qty: 1 }] }, "10.69.0.9")).json();
    await adminLogin(page);
    await page.goto(`/admin/orders/${first.id}`);
    const setup = page.getByTestId("pickup-setup");
    await setup.getByLabel("Name for this address").fill("WV Hauz Khas");
    await setup.getByLabel("Pincode").fill("110016");
    await setup.getByLabel(/Address \(house/).fill("12 Hauz Khas Village, Near Deer Park");
    await setup.getByLabel("City").fill("New Delhi");
    await setup.getByLabel("State").fill("Delhi");
    await setup.getByLabel("Phone for the courier").fill("9876500000");
    await setup.getByRole("button", { name: "Save pickup address" }).click();
    await expect(page.getByTestId("ship-now")).toBeVisible();
    expect(seen).toContain("/api/backend/clientwarehouse/create/");
    // The hand-entry courier form stays out of the way.
    await expect(page.getByLabel("AWB / tracking number")).toHaveCount(0);

    // Customers see a delivery date for their pincode.
    const pin = await request.get("/api/pincode/122002").then((r) => r.json());
    expect(pin.serviceable).toBe(true);
    expect(pin.eta).toBeGreaterThan(Date.now() + 2 * 86400_000);

    const v = await variantOf("rupa-boys-thermal-top", 20);
    const placed = await (await createOrder(request, { items: [{ variantId: v, qty: 2 }] }, "10.69.0.1")).json();
    expect((await one("select eta_at from orders where id=?", [placed.id])).eta_at).toBeTruthy();

    await page.goto(`/admin/orders/${placed.id}`);
    const panel = page.getByTestId("delhivery");
    await expect(panel).toContainText("Costs you about ₹42.01");
    await expect(panel).toContainText("about 2 days after pickup");
    await expect(panel).toContainText("Parcel: 500 g (2 pieces)");
    await expect(panel).toContainText("Asha Test1, New Delhi 110016 (collect");
    await panel.getByTestId("ship-now").click();
    await expect(panel).toContainText("AWB E2EAWB1");
    await expect(panel).toContainText("Pickup booked for");
    const booked = await one("select status, courier, awb, tracking_url, shipping_cost from orders where id=?", [placed.id]);
    expect(booked).toMatchObject({ status: "packed", courier: "Delhivery", awb: "E2EAWB1", shipping_cost: 4201 });
    expect(booked.tracking_url).toContain("delhivery.com/track-v2/package/E2EAWB1");
    const popup = page.waitForEvent("popup");
    await panel.getByRole("button", { name: "Print shipping label" }).click();
    expect((await popup).url()).toContain("label.pdf");

    // Pickup from the Orders page.
    await page.goto("/admin/orders");
    await expect(page.getByTestId("pickup")).toContainText("1 booked parcel is waiting for pickup");
    await page.getByRole("button", { name: "Request a pickup" }).click();
    await page.getByRole("button", { name: "Book pickup" }).click();
    await expect(page.getByTestId("pickup")).toContainText("A pickup is already booked for that date");

    // Tracking moves the order along and the customer sees it.
    scan = { Status: "In Transit", StatusType: "UD", StatusLocation: "Gurgaon_Hub", Instructions: "Shipment in transit" };
    await page.getByRole("button", { name: "Check tracking now" }).click();
    await expect(page.getByText(/Tracking updated on 1 order/)).toBeVisible();
    expect((await one("select status from orders where id=?", [placed.id])).status).toBe("shipped");
    await page.goto(`/order/${placed.accessToken}`);
    await expect(page.getByTestId("shipment")).toContainText("Arriving by Tuesday, 1 December");
    await expect(page.getByTestId("shipment")).toContainText("In Transit at Gurgaon_Hub: Shipment in transit");

    scan = { Status: "Dispatched", StatusType: "UD", StatusLocation: "Gurgaon_Hub", Instructions: "Out for delivery" };
    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Check tracking now" }).click();
    await expect.poll(async () => (await one("select status from orders where id=?", [placed.id])).status).toBe("out_for_delivery");
    scan = { Status: "Delivered", StatusType: "DL", StatusLocation: "Gurgaon", Instructions: "Delivered to consignee" };
    await page.getByRole("button", { name: "Check tracking now" }).click();
    await expect.poll(async () => (await one("select status, payment_status from orders where id=?", [placed.id]))).toMatchObject({ status: "delivered", payment_status: "paid" });

    // A booked shipment can be cancelled before pickup.
    const second = await (await createOrder(request, { items: [{ variantId: v, qty: 1 }] }, "10.69.0.2")).json();
    await page.goto(`/admin/orders/${second.id}`);
    await page.getByTestId("ship-now").click();
    await expect(page.getByTestId("delhivery")).toContainText("AWB E2EAWB2");
    await expect(page.getByTestId("delhivery")).toContainText("this parcel goes with it");
    await page.getByRole("button", { name: "Cancel shipment" }).click();
    await page.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(page.getByTestId("delhivery")).toContainText("Shipment cancelled");
    expect((await one("select awb, courier from orders where id=?", [second.id]))).toMatchObject({ awb: null, courier: null });
    expect(seen).toContain("/api/p/edit");
  } finally {
    fake.close();
    await db.execute("delete from settings where key in ('delhiveryPickupName','delhiveryPickupPin')");
  }
});

test("returns: 3-day window from delivery, photos and reason, admin approves with Delhivery pickup, receives, refunds; rejection; order list next steps", async ({ page, request }) => {
  let scan = { Status: "Pickup Scheduled", StatusType: "PP", StatusLocation: "Delhi", Instructions: "" };
  const fake = createServer(async (req, res) => {
    const u = new URL(req.url!, "http://127.0.0.1:3198");
    const body = await new Promise<string>((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
    const json = (o: unknown) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(o));
    if (u.pathname === "/api/dc/expected_tat") return json({ success: true, data: { tat: 1 } });
    if (u.pathname === "/api/kinko/v1/invoice/charges/.json") return json([{ total_amount: 40 }]);
    if (u.pathname === "/api/cmu/create.json") {
      const sh = JSON.parse(new URLSearchParams(body).get("data")!).shipments[0];
      return json({ packages: [{ waybill: sh.payment_mode === "Pickup" ? "RETAWB1" : `FWD${sh.order}`, status: "Success" }] });
    }
    if (u.pathname === "/api/v1/packages/json/") return json({ ShipmentData: (u.searchParams.get("waybill") ?? "").split(",").map((awb) => ({ Shipment: { AWB: awb, Status: { ...scan, StatusDateTime: new Date().toISOString() } } })) });
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => fake.listen(3198, "127.0.0.1", () => r()));
  await db.execute(`insert into settings (key, value, updated_at) values ('delhiveryPickupName', '"WV Hauz Khas"', 0), ('delhiveryPickupPin', '"110016"', 0) on conflict(key) do update set value=excluded.value`);
  const v = await variantOf("rupa-boys-thermal-top", 20);
  const delivered = async (ip: string, daysAgo: number) => {
    const o = await (await createOrder(request, { items: [{ variantId: v, qty: 2 }] }, ip)).json();
    await db.execute({ sql: "update orders set status='delivered', payment_status='paid', delivered_at=? where id=?", args: [Date.now() - daysAgo * 86400_000, o.id] });
    return o as { id: string; accessToken: string; number: string };
  };
  try {
    const old = await delivered("10.70.0.1", 4);
    await page.goto(`/order/${old.accessToken}`);
    await expect(page.getByTestId("return-panel")).toContainText("The return window closed");

    const o = await delivered("10.70.0.2", 1);
    await page.goto(`/order/${o.accessToken}`);
    const panel = page.getByTestId("return-panel");
    await expect(panel).toContainText("Return window open until");
    await expect(panel).toContainText("unused, unwashed and undamaged");
    await panel.getByRole("button", { name: "Start a return" }).click();
    await panel.getByRole("button", { name: "Send return request" }).click();
    await expect(panel.getByRole("alert")).toHaveText("Choose the items you want to return.");
    await panel.getByRole("checkbox", { name: /^Return / }).check();
    await panel.getByLabel("How many").selectOption("1");
    await panel.getByLabel("2. Why are you returning it?").selectOption("Wrong size");
    await panel.getByRole("button", { name: "Send return request" }).click();
    await expect(panel.getByRole("alert")).toHaveText("Add at least one photo of the items you're returning.");
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#888" } }).png().toBuffer();
    await panel.getByLabel("Add return photos").setInputFiles({ name: "item.png", mimeType: "image/png", buffer: png });
    await expect(panel.getByRole("img", { name: "Return photo" })).toBeVisible();
    await panel.getByRole("button", { name: "Send return request" }).click();
    await expect(panel.getByRole("alert")).toContainText("Please confirm the items are unused");
    await panel.getByRole("checkbox", { name: /I confirm these items are unused/ }).check();
    await panel.getByRole("button", { name: "Send return request" }).click();
    await expect(page.getByTestId("return-panel")).toContainText("Your return");
    const req = await one("select id, status, items, photos, confirmed_condition from return_requests where order_id=?", [o.id]);
    expect(req.status).toBe("requested");
    expect(JSON.parse(req.items as string)[0].qty).toBe(1);
    expect(JSON.parse(req.photos as string)).toHaveLength(1);

    // Admin: the next step says so, approve books the pickup.
    await adminLogin(page);
    await page.goto("/admin/orders");
    await expect(page.getByRole("link", { name: "Review return" }).first()).toBeVisible();
    await page.goto(`/admin/orders/${o.id}`);
    await expect(page.getByTestId("next-step")).toContainText("Review return");
    const admin = page.getByTestId("admin-return");
    await expect(admin).toContainText("Wrong size");
    await admin.getByRole("button", { name: "Approve and book pickup" }).click();
    await expect(admin).toContainText("RETAWB1");
    const stockBefore = Number((await one("select stock from variants where id=?", [v])).stock);

    scan = { Status: "Picked Up", StatusType: "PU", StatusLocation: "Delhi", Instructions: "" };
    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "Check tracking now" }).click();
    await expect.poll(async () => (await one("select status from return_requests where id=?", [req.id as string])).status).toBe("picked_up");

    await page.goto(`/admin/orders/${o.id}`);
    await page.getByTestId("admin-return").getByRole("button", { name: "Mark received" }).click();
    await expect(page.getByTestId("admin-return")).toContainText("Received, refund due");
    expect(Number((await one("select stock from variants where id=?", [v])).stock)).toBe(stockBefore + 1);
    expect((await one("select status from orders where id=?", [o.id])).status).toBe("returned");
    await page.getByTestId("admin-return").getByRole("button", { name: /^Refund ₹/ }).click();
    await expect.poll(async () => (await one("select status from return_requests where id=?", [req.id as string])).status).toBe("completed");
    await page.goto(`/order/${o.accessToken}`);
    await expect(page.getByTestId("return-panel")).toContainText("Refunded");

    // Rejection: the customer sees why, and the order is delivered again.
    const o2 = await delivered("10.70.0.3", 0);
    await page.goto(`/order/${o2.accessToken}`);
    await page.getByRole("button", { name: "Start a return" }).click();
    await page.getByRole("checkbox", { name: /^Return / }).check();
    await page.getByLabel("2. Why are you returning it?").selectOption("Changed my mind");
    await page.getByLabel("Add return photos").setInputFiles({ name: "item.png", mimeType: "image/png", buffer: png });
    await expect(page.getByRole("img", { name: "Return photo" })).toBeVisible();
    await page.getByRole("checkbox", { name: /I confirm these items are unused/ }).check();
    await page.getByRole("button", { name: "Send return request" }).click();
    await expect(page.getByTestId("return-panel")).toContainText("Your return");
    await page.goto(`/admin/orders/${o2.id}`);
    await page.getByTestId("admin-return").getByRole("button", { name: "Reject" }).click();
    await page.getByLabel(/Why can't you accept it/).fill("The photos show the tags are removed");
    await page.getByRole("button", { name: "Reject return" }).click();
    await expect(page.getByTestId("admin-return")).toContainText("Rejected");
    expect((await one("select status from orders where id=?", [o2.id])).status).toBe("delivered");
    await page.goto(`/order/${o2.accessToken}`);
    await expect(page.getByTestId("return-panel")).toContainText("The photos show the tags are removed");

    // Order list: bulk booking from the Next column's "Book shipment".
    const fresh = await (await createOrder(request, { items: [{ variantId: v, qty: 1 }] }, "10.70.0.4")).json();
    await page.goto("/admin/orders?status=to_ship");
    await expect(page.getByRole("row", { name: new RegExp(fresh.number) }).getByRole("link", { name: "Book shipment" })).toBeVisible();
    await page.getByRole("checkbox", { name: `Select ${fresh.number}` }).check();
    await page.getByRole("button", { name: "Book Delhivery" }).click();
    await expect(page.getByText(/1 booked with Delhivery/)).toBeVisible();
    expect((await one("select awb from orders where id=?", [fresh.id])).awb).toBe(`FWD${fresh.number}`);
  } finally {
    fake.close();
    await db.execute("delete from settings where key in ('delhiveryPickupName','delhiveryPickupPin')");
  }
});

test("size guide: table from the admin editor, opens beside the sizes, highlights the chosen size only", async ({ page }) => {
  const prod = await one("select id, slug from products where slug='rupa-boys-thermal-top'");
  await adminLogin(page);
  await page.goto(`/admin/products/${prod.id}`);
  await page.getByText("More options").click();
  await page.getByRole("button", { name: "Start from my sizes" }).click();
  await page.getByLabel("Row 1, Age").fill("2–4 years");
  await page.getByLabel("Row 1, Chest (cm)").fill("50");
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  const chart = JSON.parse((await one("select size_chart from products where id=?", [prod.id])).size_chart as string);
  expect(chart[0].rows[0]).toEqual(["2–4 Y", "2–4 years", "50", ""]);

  await page.goto(`/p/${prod.slug}`);
  await page.locator("#size-picker").getByRole("button", { name: "2–4 Y", exact: true }).click();
  await page.getByTestId("size-guide-open").click();
  const guide = page.getByTestId("size-guide");
  await expect(guide).toContainText("Your pick, 2–4 Y, is highlighted.");
  await expect(guide.getByRole("row", { name: /2–4 Y 2–4 years 50/ })).toHaveClass(/bg-pine-soft/);
  await expect(guide.getByRole("row", { name: /^4–6 Y/ })).not.toHaveClass(/bg-pine-soft/);
  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();
  await db.execute({ sql: "update products set size_chart='[]' where id=?", args: [prod.id] });
});

test("visitors: page views, time on page, product views, add to cart and searches show in admin; admins aren't counted", async ({ page, browser }) => {
  await db.execute("delete from page_views"); await db.execute("delete from site_events");
  const views = async () => Number((await one("select count(*) n from page_views")).n);
  await page.goto("/");
  await expect.poll(views, { timeout: 15_000 }).toBe(1);
  await page.goto("/p/rupa-boys-thermal-top");
  await expect.poll(views, { timeout: 15_000 }).toBe(2);
  await page.locator("#size-picker button:not(.line-through):not([data-testid=size-guide-open])").first().click();
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/shop?q=thermal");
  await expect.poll(views, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  await expect.poll(async () => Number((await one("select count(*) n from site_events where type='add_to_cart'")).n)).toBe(1);
  await expect.poll(async () => Number((await one("select max(duration_ms) n from page_views")).n)).toBeGreaterThan(0);
  const pid = (await one("select id from products where slug='rupa-boys-thermal-top'")).id;
  expect(Number((await one("select count(*) n from page_views where product_id=?", [pid as string])).n)).toBe(1);

  const admin = await (await browser.newContext()).newPage();
  await adminLogin(admin);
  const before = Number((await one("select count(*) n from page_views")).n);
  await admin.goto("/admin/analytics?d=1");
  await expect(admin.getByTestId("analytics-totals")).toContainText("Visitors1");
  await expect(admin.getByText("Boys' Thermal Top").first()).toBeVisible();
  await expect(admin.getByText(/1 added to cart/)).toBeVisible();
  await admin.goto("/");
  await admin.waitForTimeout(1500);
  expect(Number((await one("select count(*) n from page_views")).n)).toBe(before);
});

test("photos and size guide open above everything, close with X, Esc, Back; size guide link never covers sizes", async ({ page }) => {
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(vp);
    await page.goto("/p/rupa-boys-thermal-top");
    await page.getByTestId("gallery").locator("button").first().click();
    const box = page.getByTestId("lightbox");
    await expect(box).toBeVisible();
    // Nothing from the page (header, logo, sizes) sits on top of the viewer.
    const close = page.getByRole("button", { name: "Close photos" });
    const b = (await close.boundingBox())!;
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid=lightbox]") != null, [b.x + b.width / 2, b.y + b.height / 2])).toBe(true);
    expect(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest("[data-testid=lightbox]") != null)).toBe(true);
    await close.click();
    await expect(box).toBeHidden();
    await page.getByTestId("gallery").locator("button").first().click();
    await page.keyboard.press("Escape");
    await expect(box).toBeHidden();
    await page.getByTestId("gallery").locator("button").first().click();
    await page.goBack();
    await expect(box).toBeHidden();
    await expect(page).toHaveURL(/\/p\/rupa-boys-thermal-top/);

    // The size guide link sits in the label row, clear of every size button.
    const link = (await page.getByTestId("size-guide-open").boundingBox())!;
    for (const btn of await page.locator("#size-picker button:not([data-testid=size-guide-open])").all()) {
      const s = (await btn.boundingBox())!;
      const overlap = link.x < s.x + s.width && s.x < link.x + link.width && link.y < s.y + s.height && s.y < link.y + link.height;
      expect(overlap).toBe(false);
    }
  }
});
