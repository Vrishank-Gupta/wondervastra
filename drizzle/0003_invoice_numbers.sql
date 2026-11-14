ALTER TABLE `orders` ADD `invoice_number` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `invoiced_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_invoice_number_unique` ON `orders` (`invoice_number`);