CREATE TABLE `logistics_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`code` text NOT NULL,
	`quantity` integer NOT NULL,
	`previous_quantity` integer,
	`new_quantity` integer,
	`invoice_number` text,
	`order_number` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
