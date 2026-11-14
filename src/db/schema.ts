import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/** All money is stored in paise (integers). All timestamps are epoch ms. */
const ts = (name: string) => integer(name, { mode: "number" });
const bool = (name: string) => integer(name, { mode: "boolean" });
const created = () => ts("created_at").notNull().$defaultFn(() => Date.now());
const updated = () => ts("updated_at").notNull().$defaultFn(() => Date.now());

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: updated(),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  tagline: text("tagline"),
  description: text("description"),
  image: text("image"),
  accent: text("accent").notNull().default("#FFC21A"),
  parentId: text("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: bool("active").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

/** Labels sold in the store: partner brands (Lux, Amul…) and the store's own label. */
export const brands = sqliteTable("brands", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  tagline: text("tagline"),
  logo: text("logo"),
  /** Banner / tile photo for the brand page. */
  image: text("image"),
  /** The store's own label (e.g. hoodies), merchandised separately from partner brands. */
  isHouse: bool("is_house").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  active: bool("active").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    shortDescription: text("short_description"),
    description: text("description"),
    categoryId: text("category_id").notNull(),
    brandId: text("brand_id"),
    status: text("status", { enum: ["draft", "active", "archived"] }).notNull().default("draft"),
    price: integer("price").notNull(),
    /** MRP / crossed-out price. */
    compareAtPrice: integer("compare_at_price"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    featured: bool("featured").notNull().default(false),
    material: text("material"),
    care: text("care"),
    sizeGuide: text("size_guide"),
    option1Label: text("option1_label").notNull().default("Size"),
    option2Label: text("option2_label").notNull().default("Colour"),
    deliveryMode: text("delivery_mode", { enum: ["free", "flat"] }).notNull().default("flat"),
    deliveryCharge: integer("delivery_charge").notNull().default(0),
    codAllowed: bool("cod_allowed").notNull().default(true),
    returnable: bool("returnable").notNull().default(true),
    /** Seller "mark as out of stock" switch, regardless of stock count. */
    forceOutOfStock: bool("force_out_of_stock").notNull().default(false),
    /** Listed in the store but not on sale yet. Buyers can ask to be told when it launches. */
    comingSoon: bool("coming_soon").notNull().default(false),
    /** Optional line shown with it, e.g. "Launching in December". */
    launchNote: text("launch_note"),
    /** Show exact pieces left on the listing. */
    showStockCount: bool("show_stock_count").notNull().default(true),
    maxPerOrder: integer("max_per_order"),
    maxPerCustomer: integer("max_per_customer"),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    hsnCode: text("hsn_code"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("products_cat").on(t.categoryId), index("products_brand").on(t.brandId), index("products_status").on(t.status)],
);

export const productImages = sqliteTable(
  "product_images",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    url: text("url").notNull(),
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("images_product").on(t.productId)],
);

export const variants = sqliteTable(
  "variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    sku: text("sku"),
    option1: text("option1").notNull().default("Free size"),
    option2: text("option2").notNull().default("Default"),
    colorHex: text("color_hex"),
    /** Optional price override for this variant. */
    price: integer("price"),
    stock: integer("stock").notNull().default(0),
    active: bool("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("variants_product").on(t.productId)],
);

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    variantId: text("variant_id").notNull(),
    productId: text("product_id").notNull(),
    delta: integer("delta").notNull(),
    resultingStock: integer("resulting_stock"),
    reason: text("reason").notNull(),
    orderId: text("order_id"),
    actor: text("actor").notNull().default("system"),
    createdAt: created(),
  },
  (t) => [index("stock_variant").on(t.variantId)],
);

/** "Tell me when it's back" subscriptions. */
export const stockAlerts = sqliteTable(
  "stock_alerts",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    variantId: text("variant_id"),
    email: text("email"),
    phone: text("phone"),
    status: text("status", { enum: ["waiting", "notified", "cancelled"] }).notNull().default("waiting"),
    notifiedAt: ts("notified_at"),
    createdAt: created(),
  },
  (t) => [index("alerts_product").on(t.productId, t.status)],
);

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  phone: text("phone").unique(),
  whatsappOptIn: bool("whatsapp_opt_in").notNull().default(true),
  blocked: bool("blocked").notNull().default(false),
  adminNote: text("admin_note"),
  createdAt: created(),
  lastLoginAt: ts("last_login_at"),
});

export const addresses = sqliteTable(
  "addresses",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    pincode: text("pincode").notNull(),
    isDefault: bool("is_default").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("addr_customer").on(t.customerId)],
);

export const wishlist = sqliteTable(
  "wishlist",
  {
    customerId: text("customer_id").notNull(),
    productId: text("product_id").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("wishlist_uniq").on(t.customerId, t.productId)],
);

export const otpCodes = sqliteTable(
  "otp_codes",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: ts("consumed_at"),
    createdAt: created(),
  },
  (t) => [index("otp_identifier").on(t.identifier)],
);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  subjectType: text("subject_type", { enum: ["customer", "admin"] }).notNull(),
  subjectId: text("subject_id").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: created(),
});

export const admins = sqliteTable("admins", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["owner", "staff"] }).notNull().default("staff"),
  active: bool("active").notNull().default(true),
  lastLoginAt: ts("last_login_at"),
  createdAt: created(),
});

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: ts("window_start").notNull(),
});

export const ORDER_STATUSES = [
  "pending_payment",
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "return_requested",
  "returned",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded", "partially_refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    number: text("number").notNull().unique(),
    /** Unguessable token for the public tracking and feedback links. */
    accessToken: text("access_token").notNull().unique(),
    customerId: text("customer_id"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    pincode: text("pincode").notNull(),
    subtotal: integer("subtotal").notNull(),
    mrpTotal: integer("mrp_total").notNull().default(0),
    offerName: text("offer_name"),
    offerDiscount: integer("offer_discount").notNull().default(0),
    couponCode: text("coupon_code"),
    couponDiscount: integer("coupon_discount").notNull().default(0),
    shippingTotal: integer("shipping_total").notNull().default(0),
    shippingNote: text("shipping_note"),
    codFee: integer("cod_fee").notNull().default(0),
    total: integer("total").notNull(),
    refundedTotal: integer("refunded_total").notNull().default(0),
    paymentMethod: text("payment_method", { enum: ["razorpay", "cod"] }).notNull(),
    paymentStatus: text("payment_status", { enum: PAYMENT_STATUSES }).notNull().default("pending"),
    status: text("status", { enum: ORDER_STATUSES }).notNull().default("pending_payment"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    courier: text("courier"),
    awb: text("awb"),
    trackingUrl: text("tracking_url"),
    customerNote: text("customer_note"),
    adminNote: text("admin_note"),
    utmSource: text("utm_source"),
    utmCampaign: text("utm_campaign"),
    whatsappOptIn: bool("whatsapp_opt_in").notNull().default(true),
    stockHeld: bool("stock_held").notNull().default(true),
    placedAt: ts("placed_at"),
    shippedAt: ts("shipped_at"),
    deliveredAt: ts("delivered_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("orders_customer").on(t.customerId),
    index("orders_status").on(t.status),
    index("orders_email").on(t.email),
    index("orders_phone").on(t.phone),
    index("orders_created").on(t.createdAt),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    productId: text("product_id").notNull(),
    variantId: text("variant_id").notNull(),
    name: text("name").notNull(),
    variantLabel: text("variant_label"),
    sku: text("sku"),
    hsnCode: text("hsn_code"),
    image: text("image"),
    unitPrice: integer("unit_price").notNull(),
    unitMrp: integer("unit_mrp").notNull(),
    saleName: text("sale_name"),
    qty: integer("qty").notNull(),
  },
  (t) => [index("items_order").on(t.orderId), index("items_product").on(t.productId)],
);

/** Per-order timeline: the full history of what happened and who did it. */
export const orderEvents = sqliteTable(
  "order_events",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    type: text("type").notNull(),
    message: text("message").notNull(),
    actor: text("actor").notNull().default("system"),
    /** Shown on the customer's tracking timeline. */
    public: bool("public").notNull().default(false),
    meta: text("meta", { mode: "json" }),
    createdAt: created(),
  },
  (t) => [index("events_order").on(t.orderId)],
);

/** Store-wide audit trail: every seller action, with before and after values. */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    summary: text("summary"),
    before: text("before", { mode: "json" }),
    after: text("after", { mode: "json" }),
    ip: text("ip"),
    createdAt: created(),
  },
  (t) => [index("audit_entity").on(t.entity, t.entityId), index("audit_created").on(t.createdAt)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id"),
    event: text("event").notNull(),
    channel: text("channel", { enum: ["email", "whatsapp"] }).notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject"),
    body: text("body"),
    template: text("template"),
    params: text("params", { mode: "json" }).$type<string[]>(),
    status: text("status", { enum: ["sent", "failed", "not_configured"] }).notNull(),
    providerId: text("provider_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(1),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("notif_order").on(t.orderId), index("notif_status").on(t.status)],
);

export const coupons = sqliteTable("coupons", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description"),
  type: text("type", { enum: ["percent", "flat", "free_shipping"] }).notNull(),
  /** Percent (1-100) or paise, depending on type. */
  value: integer("value").notNull().default(0),
  minSubtotal: integer("min_subtotal").notNull().default(0),
  maxDiscount: integer("max_discount"),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  usageLimit: integer("usage_limit"),
  perCustomerLimit: integer("per_customer_limit"),
  usedCount: integer("used_count").notNull().default(0),
  firstOrderOnly: bool("first_order_only").notNull().default(false),
  excludeSaleItems: bool("exclude_sale_items").notNull().default(false),
  active: bool("active").notNull().default(true),
  createdAt: created(),
});

/** Limited-time price drops on listings. */
export const sales = sqliteTable("sales", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  badge: text("badge"),
  type: text("type", { enum: ["percent", "flat"] }).notNull(),
  value: integer("value").notNull(),
  scope: text("scope", { enum: ["all", "category", "brand", "products"] }).notNull().default("all"),
  targetIds: text("target_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  showBanner: bool("show_banner").notNull().default(true),
  active: bool("active").notNull().default(true),
  createdAt: created(),
});

/** Automatic cart rules: "above Rs X, free delivery / Y% off / Rs Z off". */
export const cartOffers = sqliteTable("cart_offers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["free_shipping", "percent", "flat"] }).notNull(),
  value: integer("value").notNull().default(0),
  minSubtotal: integer("min_subtotal").notNull(),
  maxDiscount: integer("max_discount"),
  combinesWithCoupons: bool("combines_with_coupons").notNull().default(true),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  active: bool("active").notNull().default(true),
  createdAt: created(),
});

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    orderId: text("order_id").notNull(),
    name: text("name").notNull(),
    rating: integer("rating").notNull(),
    body: text("body"),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    createdAt: created(),
  },
  (t) => [
    index("reviews_product").on(t.productId, t.status),
    uniqueIndex("reviews_uniq").on(t.orderId, t.productId),
  ],
);

/** Two touchpoints: right after ordering ("order") and after delivery ("delivery"). */
export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    type: text("type", { enum: ["order", "delivery"] }).notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("feedback_uniq").on(t.orderId, t.type)],
);

export const returnRequests = sqliteTable(
  "return_requests",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    status: text("status", { enum: ["requested", "approved", "rejected", "completed"] }).notNull().default("requested"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("returns_order").on(t.orderId)],
);

