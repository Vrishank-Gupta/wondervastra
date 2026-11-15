ALTER TABLE `products` ADD `min_pieces` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `combo_from` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `combo_above` integer;--> statement-breakpoint
ALTER TABLE `variants` ADD `combo_price` integer;