CREATE TABLE `logistics_order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`logistics_order_id` integer NOT NULL,
	`code` text NOT NULL,
	`quantity` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `logistics_order_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`logistics_order_item_id` integer NOT NULL,
	`allocation_id` integer NOT NULL,
	`street` text NOT NULL,
	`column` text NOT NULL,
	`level` text NOT NULL,
	`quantity` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `logistics_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`commitment_document_id` integer NOT NULL,
	`order_number` text NOT NULL,
	`loan_items` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'awaiting_invoice' NOT NULL,
	`invoice_number` text,
	`separated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`departed_at` text,
	`returned_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `logistics_orders_commitment_document_id_unique` ON `logistics_orders` (`commitment_document_id`);--> statement-breakpoint
CREATE TABLE `return_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`logistics_order_item_id` integer NOT NULL,
	`code` text NOT NULL,
	`street` text NOT NULL,
	`column` text NOT NULL,
	`level` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
