CREATE TABLE `area_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`pincode` text NOT NULL,
	`place` text,
	`email` text,
	`phone` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `area_requests_pin` ON `area_requests` (`pincode`);--> statement-breakpoint
CREATE UNIQUE INDEX `area_requests_contact` ON `area_requests` (`pincode`,`email`,`phone`);