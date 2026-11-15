CREATE TABLE `page_views` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`path` text NOT NULL,
	`product_id` text,
	`referrer` text,
	`source` text,
	`device` text,
	`city` text,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`scroll_pct` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pv_created` ON `page_views` (`created_at`);--> statement-breakpoint
CREATE INDEX `pv_session` ON `page_views` (`session_id`);--> statement-breakpoint
CREATE INDEX `pv_product` ON `page_views` (`product_id`);--> statement-breakpoint
CREATE TABLE `site_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`path` text,
	`label` text,
	`product_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ev_created` ON `site_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `ev_type` ON `site_events` (`type`);