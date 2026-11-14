CREATE TABLE `addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`line1` text NOT NULL,
	`line2` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`pincode` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `addr_customer` ON `addresses` (`customer_id`);--> statement-breakpoint
CREATE TABLE `admins` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admins_email_unique` ON `admins` (`email`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`summary` text,
	`before` text,
	`after` text,
	`ip` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_created` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `cart_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`min_subtotal` integer NOT NULL,
	`max_discount` integer,
	`combines_with_coupons` integer DEFAULT true NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`tagline` text,
	`description` text,
	`image` text,
	`accent` text DEFAULT '#FFC21A' NOT NULL,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`min_subtotal` integer DEFAULT 0 NOT NULL,
	`max_discount` integer,
	`starts_at` integer,
	`ends_at` integer,
	`usage_limit` integer,
	`per_customer_limit` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`first_order_only` integer DEFAULT false NOT NULL,
	`exclude_sale_items` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_unique` ON `coupons` (`code`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`phone` text,
	`whatsapp_opt_in` integer DEFAULT true NOT NULL,
	`blocked` integer DEFAULT false NOT NULL,
	`admin_note` text,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_unique` ON `customers` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`type` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_uniq` ON `feedback` (`order_id`,`type`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text,
	`event` text NOT NULL,
	`channel` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text,
	`body` text,
	`template` text,
	`params` text,
	`status` text NOT NULL,
	`provider_id` text,
	`error` text,
	`attempts` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notif_order` ON `notifications` (`order_id`);--> statement-breakpoint
CREATE INDEX `notif_status` ON `notifications` (`status`);--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`actor` text DEFAULT 'system' NOT NULL,
	`public` integer DEFAULT false NOT NULL,
	`meta` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_order` ON `order_events` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`name` text NOT NULL,
	`variant_label` text,
	`sku` text,
	`hsn_code` text,
	`image` text,
	`unit_price` integer NOT NULL,
	`unit_mrp` integer NOT NULL,
	`sale_name` text,
	`qty` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `items_order` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `items_product` ON `order_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`access_token` text NOT NULL,
	`customer_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`line1` text NOT NULL,
	`line2` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`pincode` text NOT NULL,
	`subtotal` integer NOT NULL,
	`mrp_total` integer DEFAULT 0 NOT NULL,
	`offer_name` text,
	`offer_discount` integer DEFAULT 0 NOT NULL,
	`coupon_code` text,
	`coupon_discount` integer DEFAULT 0 NOT NULL,
	`shipping_total` integer DEFAULT 0 NOT NULL,
	`shipping_note` text,
	`cod_fee` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`refunded_total` integer DEFAULT 0 NOT NULL,
	`payment_method` text NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`status` text DEFAULT 'pending_payment' NOT NULL,
	`razorpay_order_id` text,
	`razorpay_payment_id` text,
	`courier` text,
	`awb` text,
	`tracking_url` text,
	`customer_note` text,
	`admin_note` text,
	`utm_source` text,
	`utm_campaign` text,
	`whatsapp_opt_in` integer DEFAULT true NOT NULL,
	`stock_held` integer DEFAULT true NOT NULL,
	`placed_at` integer,
	`shipped_at` integer,
	`delivered_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_access_token_unique` ON `orders` (`access_token`);--> statement-breakpoint
CREATE INDEX `orders_customer` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `orders_status` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_email` ON `orders` (`email`);--> statement-breakpoint
CREATE INDEX `orders_phone` ON `orders` (`phone`);--> statement-breakpoint
CREATE INDEX `orders_created` ON `orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `otp_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `otp_identifier` ON `otp_codes` (`identifier`);--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`url` text NOT NULL,
	`alt` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `images_product` ON `product_images` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`short_description` text,
	`description` text,
	`category_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`price` integer NOT NULL,
	`compare_at_price` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`material` text,
	`care` text,
	`size_guide` text,
	`option1_label` text DEFAULT 'Size' NOT NULL,
	`option2_label` text DEFAULT 'Colour' NOT NULL,
	`delivery_mode` text DEFAULT 'flat' NOT NULL,
	`delivery_charge` integer DEFAULT 0 NOT NULL,
	`cod_allowed` integer DEFAULT true NOT NULL,
	`returnable` integer DEFAULT true NOT NULL,
	`force_out_of_stock` integer DEFAULT false NOT NULL,
	`show_stock_count` integer DEFAULT true NOT NULL,
	`max_per_order` integer,
	`max_per_customer` integer,
	`low_stock_threshold` integer DEFAULT 5 NOT NULL,
	`hsn_code` text,
	`seo_title` text,
	`seo_description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_cat` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_status` ON `products` (`status`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `return_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `returns_order` ON `return_requests` (`order_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`order_id` text NOT NULL,
	`name` text NOT NULL,
	`rating` integer NOT NULL,
	`body` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reviews_product` ON `reviews` (`product_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_uniq` ON `reviews` (`order_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`badge` text,
	`type` text NOT NULL,
	`value` integer NOT NULL,
	`scope` text DEFAULT 'all' NOT NULL,
	`target_ids` text DEFAULT '[]' NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`show_banner` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`email` text,
	`phone` text,
	`status` text DEFAULT 'waiting' NOT NULL,
	`notified_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `alerts_product` ON `stock_alerts` (`product_id`,`status`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`product_id` text NOT NULL,
	`delta` integer NOT NULL,
	`resulting_stock` integer,
	`reason` text NOT NULL,
	`order_id` text,
	`actor` text DEFAULT 'system' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_variant` ON `stock_movements` (`variant_id`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`sku` text,
	`option1` text DEFAULT 'Free size' NOT NULL,
	`option2` text DEFAULT 'Default' NOT NULL,
	`color_hex` text,
	`price` integer,
	`stock` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `variants_product` ON `variants` (`product_id`);--> statement-breakpoint
CREATE TABLE `wishlist` (
	`customer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_uniq` ON `wishlist` (`customer_id`,`product_id`);