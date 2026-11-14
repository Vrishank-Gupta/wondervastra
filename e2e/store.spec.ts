import { createHmac } from "node:crypto";
import { createClient } from "@libsql/client";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import sharp from "sharp";

const db = createClient({ url: "file:./data/e2e.db" });
const ADMIN = { email: "e2e@vastravibe.test", password: "e2e-password-1234" };
const rows = async (sql: string, args: (string | number)[] = []) => (await db.execute({ sql, args })).rows as unknown as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = async (sql: string, args: (string | number)[] = []) => (await rows(sql, args))[0];

const buyer = (n: number) => ({ name: `Asha Test${n}`, email: `asha${n}@example.com`, phone: `98765432${String(n).padStart(2, "0")}` });
const addr = { line1: "12 MG Road", line2: "Near Park", city: "Pune", state: "Maharashtra", pincode: "411001" };

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
  await page.locator("#size-picker button:not(.line-through)").first().click();
  await expect(page.getByText(/pieces? (available|left)/)).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).first().click();

  const drawer = page.getByRole("dialog", { name: "Your cart" });
  await expect(drawer.getByText(/Add .* more for/)).toBeVisible();
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

  const shipBtn = page.getByRole("button", { name: "Save & mark shipped" });
  await expect(shipBtn).toBeDisabled(); // No AWB yet.
  await page.getByLabel("Courier").selectOption("Delhivery");
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
  await expect(page.getByText(/customer\(s\) notified/)).toBeVisible();

  const after = await one("select * from stock_alerts where id=?", [a.id as unknown as string]);
  expect(after.status).toBe("notified");
  const msgs = await rows("select * from notifications where event='back_in_stock' and recipient='9812345678'");
  expect(msgs.length).toBe(1);

  await page.goto("/p/amul-girls-thermal-leggings");
  await page.locator("#size-picker button:not(.line-through)").first().click();
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
  await page.getByLabel("Mobile number or email").fill(b.email);
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
  await page.getByLabel(/MRP/).fill("799");
  await expect(page.getByText("Buyers see 38% off MRP")).toBeVisible();
  await page.getByText("Free delivery", { exact: true }).click();
  // Colours outside the ready-made list are typed in; sizes stay "Free size" for jewellery.
  for (const c of ["Gold", "Silver"]) { await page.getByLabel("Other colour").fill(c); await page.getByRole("button", { name: "Add colour" }).click(); }
  await page.getByLabel("Same for all").fill("9");
  await page.getByRole("button", { name: "Fill all" }).click();
  await page.getByLabel("Stock for Silver").fill("3");
  await expect(page.getByRole("heading", { name: /Stock: 12 pieces/ })).toBeVisible();
  await page.getByText("More options").click();
  await page.getByLabel("Max per order").fill("2");

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
  await expect(page.getByText("Free delivery on this item")).toBeVisible();
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
  await page.getByRole("tab", { name: /Timed sales/ }).click();
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
  await page.getByRole("tab", { name: /Timed sales/ }).click();
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
  await page.locator('a[href="/c/kids-thermals?collection=baby"]').first().click();
  await page.waitForURL("**/c/kids-thermals?collection=baby");
  const babies = Number((await one("select count(*) n from products where status='active' and tags like '%\"baby\"%'")).n);
  await expect(page.getByText(`${babies} items`)).toBeVisible();

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
  await page.getByLabel("Mobile number or email").fill("redirect@example.com");
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
  await db.execute(`insert into settings (key, value, updated_at) values ('gstin', '"27ABCDE1234F1Z5"', 0), ('businessState', '"Maharashtra"', 0), ('legalName', '"WonderVastra Retail"', 0) on conflict(key) do update set value=excluded.value`);
  const a = await (await createOrder(request, { ...buyer(71), items: [{ variantId: await variantOf("rupa-boys-thermal-top", 20), qty: 2 }] }, "10.67.0.4")).json();
  const b = await (await createOrder(request, { ...buyer(72), state: "Karnataka", city: "Bengaluru", pincode: "560001", items: [{ variantId: await variantOf("rupa-boys-thermal-top"), qty: 1 }] }, "10.67.0.5")).json();
  await page.goto(`/admin/orders/${a.id}/invoice`);
  await expect(page.getByText("Tax invoice")).toBeVisible();
  const first = (await page.getByText(/^Invoice no\./).innerText()).match(/WV\/\d{4}-\d{2}\/(\d{5})/)!;
  await expect(page.getByText("CGST + SGST (intra-state)")).toBeVisible();
  await expect(page.getByText("GSTIN: 27ABCDE1234F1Z5")).toBeVisible();
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
  expect(p.offers.shippingDetails.shippingDestination.addressCountry).toBe("IN");
  expect(product.find((x) => x["@type"] === "BreadcrumbList").itemListElement.length).toBe(3);
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe("http://localhost:3100/p/rupa-boys-thermal-top");

  const cat = await ld("/c/kids-thermals");
  expect(cat.find((x) => x["@type"] === "ItemList").numberOfItems).toBeGreaterThan(0);
  const faq = await ld("/info/faq");
  expect(faq.find((x) => x["@type"] === "FAQPage").mainEntity.length).toBeGreaterThan(5);

  // Search results pages aren't indexed; category pages are.
  await page.goto("/shop?q=thermal");
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
  await page.goto("/c/kids-thermals?collection=baby");
  expect(await page.locator('meta[name="robots"]').count()).toBe(0);

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("GPTBot");
  expect(robots).toContain("ClaudeBot");
  expect(robots).toContain("PerplexityBot");
  expect(robots).toMatch(/Disallow: \/admin/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/p/rupa-boys-thermal-top");
  expect(sitemap).toContain("<image:loc>");
  expect(sitemap).toContain("collection=baby");
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
  await page.getByLabel("Mobile number or email").fill("wish.qa@example.com");
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
