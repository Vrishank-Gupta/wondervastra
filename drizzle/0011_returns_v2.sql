ALTER TABLE `return_requests` ADD `items` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `return_requests` ADD `photos` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `return_requests` ADD `confirmed_condition` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `return_requests` ADD `admin_note` text;--> statement-breakpoint
ALTER TABLE `return_requests` ADD `pickup_awb` text;--> statement-breakpoint
ALTER TABLE `return_requests` ADD `pickup_status` text;--> statement-breakpoint
ALTER TABLE `return_requests` ADD `decided_at` integer;--> statement-breakpoint
ALTER TABLE `return_requests` ADD `received_at` integer;