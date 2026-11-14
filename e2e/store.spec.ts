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
  await page.getByLabel("Email").fill(ADMIN.email);
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
  // ₹299 list, no sale on kids' thermals; 10% coupon; ₹49 delivery.
  expect(o.total).toBe(29900 - 2990 + 4900);
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
  // ₹299 x 7 = ₹2093 (boys' thermal top): 10% off above ₹1,999 (₹209.30) + ₹50 coupon; free delivery above ₹799; ₹30 COD fee.
  expect(o.subtotal).toBe(209300);
  expect(o.offer_discount).toBe(20930);
  expect(o.coupon_discount).toBe(5000);
  expect(o.shipping_total).toBe(0);
  expect(o.total).toBe(209300 - 20930 - 5000 + 3000);
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
  await expect(page.getByText("Cover")).toBeVisible();

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
  await expect(page.getByText(`${ar} items`)).toBeVisible();

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
  await expect(page.getByText(`${live} items`)).toBeVisible();
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
