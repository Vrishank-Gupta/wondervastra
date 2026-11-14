ALTER TABLE `customers` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `google_sub` text;--> statement-breakpoint
CREATE UNIQUE INDEX `customers_google_sub_unique` ON `customers` (`google_sub`);